const { GoogleGenAI, Type } = require('@google/genai');
const config = require('./config');
const { getRecentAlerts } = require('./alertsCache');

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

async function analyzeMessage(messageText) {
    if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') {
        return null;
    }

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

        if (!parsedResult.isAcademicUpdate || parsedResult.category === "NONE") {
            return null;
        }

        return parsedResult;
    } catch (error) {
        console.error("Error analyzing message with GenAI:", error.message);
        return null; // Fail gracefully
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
        console.error("Error asking pet question:", error.message);
        return "Sorry, I'm having trouble thinking right now. Please try again later.";
    }
}

async function askPetAudio(base64Audio) {
    if (!base64Audio) {
        return "I didn't hear anything. Could you try again?";
    }

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
                {
                    inlineData: {
                        mimeType: "audio/webm",
                        data: base64Audio
                    }
                }
            ]
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing audio:", error.message);
        return "Sorry, I had trouble processing that audio. Please try again.";
    }
}

module.exports = {
    analyzeMessage,
    askPetQuestion,
    askPetAudio
};
