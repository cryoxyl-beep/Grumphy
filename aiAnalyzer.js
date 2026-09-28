const { GoogleGenAI, Type } = require('@google/genai');
const config = require('./config');
const { getRecentAlerts } = require('./alertsCache');
const { tools, executeSystemTool, AGENT_TOOLS } = require('./systemTools');
const { BrowserWindow } = require('electron');
const logger = require('./logger');

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        isAcademicUpdate: {
            type: Type.BOOLEAN,
            description: "true if the message announces an assignment, lab submission, mid/sem exam, quiz, viva, timetable change, or academic circular. False for casual banter, forwards, greetings, memes, or attendance queries from students."
        },
        category: {
            type: Type.STRING,
            enum: ["ASSIGNMENT", "EXAM_TEST", "LAB_SUBMISSION", "GENERAL_NOTICE", "NONE"]
        },
        summary: {
            type: Type.STRING,
            description: "1-2 concise lines summarizing the task/event. Return empty string if not an update."
        },
        deadline: {
            type: Type.STRING,
            description: "Extracted submission date/time or 'Not specified'."
        },
        urgency: {
            type: Type.STRING,
            enum: ["HIGH", "MEDIUM", "LOW"]
        }
    },
    required: ["isAcademicUpdate", "category", "summary", "deadline", "urgency"]
};

// Warm-up request to Ollama on app startup
(async () => {
    try {
        await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
                keep_alive: "30m"
            })
        });
        logger.info('AI', 'Ollama warm-up call successful.');
    } catch (e) {
        logger.warn('AI', 'Ollama warm-up call failed.', e);
    }
})();

async function analyzeMessage(messageText) {
    if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') return null;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Analyze the following message:\n\n${messageText}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        });
        const parsedResult = JSON.parse(response.text);
        if (!parsedResult.isAcademicUpdate || parsedResult.category === "NONE") return null;
        return parsedResult;
    } catch (error) {
        logger.error("AI", "Error analyzing message with GenAI:", error.message);
        return null;
    }
}

async function askPetQuestion(userSpokenQuestion) {
    if (!userSpokenQuestion || typeof userSpokenQuestion !== 'string' || userSpokenQuestion.trim() === '') {
        return "I didn't quite catch that. Could you repeat?";
    }
    try {
        const recentAlerts = getRecentAlerts();
        const systemPrompt = `You are a cheerful, helpful, cute desktop companion mascot.
Here are the recent academic alerts as your system knowledge:
${JSON.stringify(recentAlerts, null, 2)}
Instruction: Answer the user's spoken question concisely (1 to 2 short spoken sentences max). If no relevant deadline exists in the cache, gently say so. Keep the tone friendly and direct. DO NOT use markdown formatting, asterisks, or emojis, as your response will be read by a text-to-speech engine.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `${systemPrompt}\n\nUser Question: ${userSpokenQuestion}`
        });
        return response.text;
    } catch (error) {
        logger.error("AI", "Error asking pet question:", error.message);
        return "Sorry, I'm having trouble thinking right now. Please try again later.";
    }
}

async function askPetAudio(base64Audio) {
    if (!base64Audio) return "I didn't hear anything. Could you try again?";
    try {
        const recentAlerts = getRecentAlerts();
        const systemPrompt = `You are a cheerful, helpful, cute desktop companion mascot.
Here are the recent academic alerts as your system knowledge:
${JSON.stringify(recentAlerts, null, 2)}
Instruction: Listen to the user's spoken audio question and answer it concisely (1 to 2 short spoken sentences max). If no relevant deadline exists in the cache, gently say so. Keep the tone friendly and direct. DO NOT use markdown formatting, asterisks, or emojis, as your response will be read by a text-to-speech engine.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: [
                { text: systemPrompt },
                { inlineData: { mimeType: "audio/webm", data: base64Audio } }
            ]
        });
        return response.text;
    } catch (error) {
        logger.error("AI", "Error analyzing audio:", error.message);
        return "Sorry, I had trouble processing that audio. Please try again.";
    }
}

let isAgentExecuting = false;
let lastAgentExecutionTime = 0;
const AGENT_RATE_LIMIT_DELAY_MS = 2500;

function sendAgentProgress(msg) {
    if (BrowserWindow && BrowserWindow.getAllWindows) {
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('agent-progress', msg);
            }
        });
    }
    logger.debug('AgentProgress', msg);
}

// Helper to retry Gemini calls with exponential backoff
async function callGeminiWithRetries(options) {
    let attempts = 0;
    const maxRetries = 3;
    const delays = [1000, 2000, 4000];
    
    while (true) {
        try {
            return await ai.models.generateContent(options);
        } catch (error) {
            const status = error.status || (error.response && error.response.status);
            if (status === 429 || status === 503) {
                if (attempts < maxRetries) {
                    logger.warn('AI', `Gemini rate limited (${status}), retrying in ${delays[attempts]}ms...`);
                    await new Promise(r => setTimeout(r, delays[attempts]));
                    attempts++;
                    continue;
                } else if (options.model !== 'gemini-3.1-flash-lite') {
                    logger.warn('AI', `Gemini rate limited (${status}) after ${maxRetries} retries, falling back to gemini-3.1-flash-lite.`);
                    options.model = 'gemini-3.1-flash-lite';
                    try {
                        return await ai.models.generateContent(options);
                    } catch (fallbackError) {
                        logger.error('AI', `Gemini API error (fallback): ${fallbackError.message}`, fallbackError.stack);
                        throw fallbackError;
                    }
                }
            }
            logger.error('AI', `Gemini API error: ${error.message}`, error.stack);
            throw error;
        }
    }
}

async function executeAgentCommand(userQuery, petRole = 'system') {
    if (isAgentExecuting) {
        return "Hold on, I'm already busy executing a task. Give me a second!";
    }
    isAgentExecuting = true;
    
    const watchdogController = new AbortController();
    const watchdogTimer = setTimeout(() => {
        logger.error('Agent', 'Task watchdog triggered. Aborting after 90s.');
        watchdogController.abort();
    }, 90000);

    let userText = userQuery;
    if (typeof userQuery === 'object' && userQuery.base64Audio) {
        userText = "The user spoke an instruction via audio.";
    }

    logger.info('Agent', `Received user command: ${userText}`);

    try {
        const now = Date.now();
        const timeSinceLast = now - lastAgentExecutionTime;
        if (timeSinceLast < AGENT_RATE_LIMIT_DELAY_MS) {
            await new Promise(resolve => setTimeout(resolve, AGENT_RATE_LIMIT_DELAY_MS - timeSinceLast));
        }
        lastAgentExecutionTime = Date.now();

        if (!userQuery) return "What would you like me to do?";

        const systemInstruction = "You are Operator, a pragmatic and slightly witty AI desktop companion that controls Windows 11. To open a site use open_url. To type: first click_coordinate on the field, then type_text. To close an app use close_application, never launch_application. After each tool result, if the task is not finished call the next tool; when finished reply with one short sentence.";
        
        let fallbackToGemini = false;
        let messages = [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: String(userText) }
        ];

        try {
            sendAgentProgress("Thinking (Local)...");
            let ollamaFinished = false;
            let finalAnswer = "";
            let steps = 0;
            let previousToolCall = null; // for loop detection

            while (steps < 10 && !ollamaFinished) {
                if (watchdogController.signal.aborted) throw new Error("Task aborted by watchdog");
                steps++;
                logger.info('Agent', `Starting step ${steps}`);

                const reqController = new AbortController();
                const timeoutId = setTimeout(() => reqController.abort(), 30000);
                
                let response;
                const reqBody = {
                    model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
                    messages: messages,
                    tools: AGENT_TOOLS,
                    temperature: 0,
                    keep_alive: "30m",
                    stream: false
                };
                
                logger.debug('Agent', `Ollama request (messages length: ${messages.length}, model: ${reqBody.model})`);

                try {
                    response = await fetch('http://localhost:11434/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reqBody),
                        signal: reqController.signal
                    });
                    clearTimeout(timeoutId);
                } catch (err) {
                    clearTimeout(timeoutId);
                    if (err.cause?.code === 'ECONNREFUSED' || err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
                        logger.warn('Agent', `Ollama connection error or timeout: ${err.message}`);
                        throw err;
                    }
                    throw err;
                }

                if (!response.ok) throw new Error("Ollama error " + response.status);
                const data = await response.json();
                const msg = data.message;
                
                let logResponse = { ...msg };
                if (logResponse.content && logResponse.content.length > 500) logResponse.content = logResponse.content.substring(0, 500) + '...';
                logger.debug('Agent', `Ollama response`, JSON.stringify(logResponse));

                messages.push(msg);

                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    for (const call of msg.tool_calls) {
                        const toolName = call.function.name;
                        let args = call.function.arguments;
                        if (typeof args === 'string') {
                            try { args = JSON.parse(args); } catch (e) { 
                                logger.error('Agent', 'Tool args parsing failed'); 
                            }
                        }

                        logger.info('Agent', `Calling tool ${toolName} with args:`, args);
                        
                        // Loop detection
                        const currentCallStr = JSON.stringify({ name: toolName, args });
                        if (previousToolCall === currentCallStr) {
                            logger.warn('Agent', `Loop detected: Repeated tool call ${toolName}`);
                            finalAnswer = "I seem to be stuck in a loop trying to perform that action.";
                            ollamaFinished = true;
                            break;
                        }
                        previousToolCall = currentCallStr;
                        
                        sendAgentProgress(`Running tool: ${toolName}...`);
                        
                        let result;
                        const startToolTime = Date.now();
                        
                        if (!AGENT_TOOLS.find(t => t.function.name === toolName)) {
                            result = { success: false, error: "Unknown tool: " + toolName };
                        } else {
                            try {
                                if (toolName === 'look_at_screen_and_find') {
                                    const { get_screen_image } = require('./systemTools');
                                    const sysRes = await get_screen_image();
                                    if (sysRes.success && sysRes.buffer) {
                                        sendAgentProgress(`Analyzing screen for ${args.targetDescription}...`);
                                        try {
                                            const visionRes = await callGeminiWithRetries({
                                                model: 'gemini-2.5-flash',
                                                contents: [
                                                    { text: `Return a 2D bounding box for the requested element in the format [ymin, xmin, ymax, xmax]. Use a normalized scale of 0 to 1000. Element: '${args.targetDescription}'` },
                                                    { inlineData: { mimeType: "image/jpeg", data: sysRes.buffer } }
                                                ],
                                                config: { responseMimeType: "application/json" }
                                            });
                                            logger.debug('Agent', `Raw Gemini Vision output: ${visionRes.text}`);
                                            
                                            let rawText = visionRes.text;
                                            if (rawText.includes('```')) {
                                                const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                                                if (match) rawText = match[1];
                                            }
                                            const parsed = JSON.parse(rawText);
                                            const box_2d = Array.isArray(parsed) ? parsed : (parsed.box_2d || Object.values(parsed)[0]);
                                            
                                            if (Array.isArray(box_2d) && box_2d.length === 4) {
                                                const [ymin, xmin, ymax, xmax] = box_2d;
                                                const x = Math.round((xmin + xmax) / 2 / 1000 * sysRes.physicalWidth);
                                                const y = Math.round((ymin + ymax) / 2 / 1000 * sysRes.physicalHeight);
                                                logger.info('Agent', `Converted coords: x=${x}, y=${y}`);
                                                result = { found: true, x, y };
                                            } else {
                                                result = { found: false };
                                            }
                                        } catch (e) {
                                            result = { success: false, error: e.message };
                                        }
                                    } else {
                                        result = sysRes;
                                    }
                                } else {
                                    result = await executeSystemTool(toolName, args);
                                }
                            } catch (toolErr) {
                                result = { success: false, error: toolErr.message };
                            }
                        }
                        
                        const toolDuration = Date.now() - startToolTime;
                        logger.info('Agent', `Tool ${toolName} finished in ${toolDuration}ms. Result:`, result);

                        messages.push({
                            role: 'tool',
                            tool_name: toolName,
                            content: typeof result === 'string' ? result : JSON.stringify(result)
                        });
                    }
                } else {
                    finalAnswer = msg.content;
                    ollamaFinished = true;
                }
            }
            
            if (ollamaFinished) {
                logger.info('Agent', `Task finished locally with: ${finalAnswer}`);
                return finalAnswer;
            }
            if (watchdogController.signal.aborted) {
                return "I'm sorry, that task took too long, so I aborted it.";
            }
            logger.warn('Agent', "Exceeded 10 steps, falling back or returning error");
            throw new Error("Exceeded 10 steps");
            
        } catch (e) {
            logger.warn('Agent', `Ollama offline or slow, falling back to Gemini... Reason: ${e.message}`);
            sendAgentProgress("Switching to Cloud AI...");
            fallbackToGemini = true;
        }

        if (fallbackToGemini) {
            let userParts = [];
            if (typeof userQuery === 'string') {
                userParts = [{ text: userQuery.trim() }];
            } else if (typeof userQuery === 'object' && userQuery.base64Audio) {
                userParts = [
                    { text: "The user spoke this instruction. Execute the appropriate tool to fulfill it:" },
                    { inlineData: { mimeType: "audio/webm", data: userQuery.base64Audio } }
                ];
            } else {
                userParts = [{ text: String(userQuery) }];
            }

            logger.info('Agent', `Sending request to Gemini (model: gemini-3.1-flash-lite)`);
            const firstResponse = await callGeminiWithRetries({
                model: 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: userParts }],
                config: {
                    systemInstruction,
                    tools,
                    temperature: 0
                }
            });

            const functionCalls = firstResponse.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
                const functionResponseParts = [];

                for (const call of functionCalls) {
                    let toolResult;
                    const startToolTime = Date.now();
                    logger.info('Agent', `Gemini requested tool ${call.name} with args:`, call.args);

                    try {
                        if (call.name === 'look_at_screen_and_find') {
                            const { get_screen_image } = require('./systemTools');
                            const sysRes = await get_screen_image();
                            if (sysRes.success && sysRes.buffer) {
                                sendAgentProgress(`Analyzing screen for ${call.args.targetDescription}...`);
                                try {
                                    const visionRes = await callGeminiWithRetries({
                                        model: 'gemini-2.5-flash',
                                        contents: [
                                            { text: `Return a 2D bounding box for the requested element in the format [ymin, xmin, ymax, xmax]. Use a normalized scale of 0 to 1000. Element: '${call.args.targetDescription}'` },
                                            { inlineData: { mimeType: "image/jpeg", data: sysRes.buffer } }
                                        ],
                                        config: { responseMimeType: "application/json" }
                                    });
                                    logger.debug('Agent', `Raw Gemini Vision output: ${visionRes.text}`);
                                    
                                    let rawText = visionRes.text;
                                    if (rawText.includes('```')) {
                                        const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                                        if (match) rawText = match[1];
                                    }
                                    const parsed = JSON.parse(rawText);
                                    const box_2d = Array.isArray(parsed) ? parsed : (parsed.box_2d || Object.values(parsed)[0]);
                                    
                                    if (Array.isArray(box_2d) && box_2d.length === 4) {
                                        const [ymin, xmin, ymax, xmax] = box_2d;
                                        const x = Math.round((xmin + xmax) / 2 / 1000 * sysRes.physicalWidth);
                                        const y = Math.round((ymin + ymax) / 2 / 1000 * sysRes.physicalHeight);
                                        logger.info('Agent', `Converted coords: x=${x}, y=${y}`);
                                        toolResult = { found: true, x, y };
                                    } else {
                                        toolResult = { found: false };
                                    }
                                } catch (e) {
                                    toolResult = { success: false, error: e.message };
                                }
                            } else {
                                toolResult = sysRes;
                            }
                        } else {
                            toolResult = await executeSystemTool(call.name, call.args || {});
                        }
                    } catch (toolErr) {
                        toolResult = { success: false, error: toolErr.message };
                    }
                    
                    const toolDuration = Date.now() - startToolTime;
                    logger.info('Agent', `Tool ${call.name} finished in ${toolDuration}ms. Result:`, toolResult);

                    functionResponseParts.push({
                        functionResponse: {
                            id: call.id,
                            name: call.name,
                            response: typeof toolResult === 'object' && toolResult !== null ? toolResult : { output: String(toolResult) }
                        }
                    });
                }

                const modelTurn = firstResponse.candidates?.[0]?.content || { role: 'model', parts: [{ functionCall: functionCalls[0] }] };
                
                logger.info('Agent', `Sending follow-up to Gemini with tool results.`);
                const followUpResponse = await callGeminiWithRetries({
                    model: 'gemini-3.1-flash-lite',
                    contents: [
                        { role: 'user', parts: userParts },
                        modelTurn,
                        {
                            role: 'user',
                            parts: functionResponseParts
                        }
                    ],
                    config: {
                        systemInstruction,
                        tools,
                        temperature: 0
                    }
                });

                const ans = (followUpResponse.text || "Done!").trim();
                logger.info('Agent', `Task finished via Gemini with: ${ans}`);
                return ans;
            }

            const ans = (firstResponse.text || "Understood.").trim();
            logger.info('Agent', `Task finished via Gemini without tools: ${ans}`);
            return ans;
        }

    } catch (error) {
        logger.error("Agent", "Error in executeAgentCommand:", error.message, error.stack);
        return "Sorry, I'm having trouble connecting to AI right now. Please try again in a moment!";
    } finally {
        isAgentExecuting = false;
        sendAgentProgress(""); 
        clearTimeout(watchdogTimer);
    }
}

module.exports = {
    analyzeMessage,
    askPetQuestion,
    askPetAudio,
    executeAgentCommand
};
