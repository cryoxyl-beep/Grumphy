const config = require('./config');
const { client } = require('./whatsappClient');
const { analyzeMessage } = require('./aiAnalyzer');
const { sendAcademicNotification } = require('./notifierService');
const { saveAlert } = require('./alertsCache');
const logger = require('./logger');
const { screen } = require('electron');

// 1. Add uncaughtException and unhandledRejection
process.on('uncaughtException', (err) => {
    logger.error('Main', 'Uncaught Exception', err);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Main', 'Unhandled Rejection at', promise, 'reason:', reason);
});

// Startup Log
async function logStartup() {
    let ollamaReachable = false;
    let modelName = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
    try {
        const res = await fetch('http://localhost:11434/api/tags', { method: 'GET', timeout: 2000 });
        if (res.ok) ollamaReachable = true;
    } catch (e) {}

    let width = 0, height = 0, scaleFactor = 1;
    try {
        if (screen && screen.getPrimaryDisplay) {
            const display = screen.getPrimaryDisplay();
            width = display.size.width;
            height = display.size.height;
            scaleFactor = display.scaleFactor;
        }
    } catch (e) {}

    logger.info('Startup', `Ollama reachable? ${ollamaReachable}`);
    logger.info('Startup', `Model name: ${modelName}`);
    logger.info('Startup', `Screen size: ${width}x${height}, scaleFactor: ${scaleFactor}`);
    logger.info('Startup', `Versions: Node ${process.versions.node}, Electron ${process.versions.electron}, Chrome ${process.versions.chrome}`);
}

// Call logStartup when ready (handled via app.whenReady in the actual electron entrypoint if needed, or here)
try {
    const { app } = require('electron');
    if (app) app.whenReady().then(logStartup);
} catch (e) {
    logStartup();
}

logger.info('Agent', `WhatsApp agent starting... Log Level: ${config.logLevel}`);

const EventEmitter = require('events');
const agentEvents = new EventEmitter();

const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    const { msg, chatName, messageText } = messageQueue.shift();

    try {
        logger.debug('Agent', `Processing message from ${chatName}...`);

        const analysisResult = await analyzeMessage(messageText);
        
        if (analysisResult && analysisResult.isAcademicUpdate) {
            const alertData = {
                ...analysisResult,
                groupName: chatName
            };
            await sendAcademicNotification(alertData);
            saveAlert(alertData);
            agentEvents.emit('academic-alert', alertData);
        }
    } catch (error) {
        logger.error("Agent", "Error during message processing:", error.message);
    } finally {
        isProcessingQueue = false;
        processQueue();
    }
}

const chatNameCache = new Map();

async function resolveGroupName(chatId) {
    if (chatNameCache.has(chatId)) {
        return chatNameCache.get(chatId);
    }
    let resolved = chatId;
    try {
        const chats = await client.getChats();
        if (Array.isArray(chats)) {
            for (const c of chats) {
                if (c && c.id && c.id._serialized) {
                    chatNameCache.set(c.id._serialized, c.name || c.id._serialized);
                }
            }
        }
        resolved = chatNameCache.get(chatId) || chatId;
    } catch (e) {
        resolved = chatId;
    }
    chatNameCache.set(chatId, resolved);
    return resolved;
}

client.on('message_create', async (msg) => {
    try {
        const chatId = msg.fromMe ? msg.to : msg.from;
        const isGroup = chatId && chatId.endsWith('@g.us');

        if (!isGroup) return; 

        const chatName = await resolveGroupName(chatId);

        logger.debug('Agent', `Detected message in Group ID: ${chatId}`);
        logger.debug('Agent', `Resolved Group Name: "${chatName}"`);

        if (config.targetGroupNames.length > 0) {
            const isTargetGroup = config.targetGroupNames.some(target => {
                const matchesName = chatName && chatName.toLowerCase().includes(target.toLowerCase().trim());
                const matchesId = chatId.includes(target.trim());
                return matchesName || matchesId;
            });

            logger.debug('Agent', `Did it match your .env targets? ${isTargetGroup}`);
            if (!isTargetGroup) return;
        }

        const messageText = msg.body || msg.caption || "";
        
        if (messageText.trim().length < 15) {
            return;
        }

        logger.info('Agent', `[Group Message from "${chatName}"]: ${messageText.substring(0, 50)}...`);

        messageQueue.push({ msg, chatName, messageText });
        processQueue();

    } catch (err) {
        logger.error('Agent', 'Error in message listener:', err.stack || err);
    }
});

const cleanupAndExit = async () => {
    logger.info('Agent', 'Shutting down WhatsApp client gracefully...');
    try {
        await client.destroy();
        logger.info('Agent', 'Client destroyed successfully.');
    } catch (e) {
        logger.error('Agent', 'Error destroying client:', e.message);
    }
    process.exit(0);
};

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

logger.info('Agent', 'Initializing WhatsApp client...');
client.initialize();

module.exports = { agentEvents };
