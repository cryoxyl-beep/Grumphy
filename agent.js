const config = require('./config');
const { client } = require('./whatsappClient');
const { analyzeMessage } = require('./aiAnalyzer');
const { sendAcademicNotification } = require('./notifierService');
const { saveAlert } = require('./alertsCache');

console.log(`WhatsApp agent starting... Log Level: ${config.logLevel}`);

const EventEmitter = require('events');
const agentEvents = new EventEmitter();

// Simple sequential queue to prevent rate-limit bursting
const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    const { msg, chatName, messageText } = messageQueue.shift();

    try {
        if (config.logLevel === 'debug') {
            console.log(`Processing message from ${chatName}...`);
        }

        const analysisResult = await analyzeMessage(messageText);
        
        // Ensure we only emit if it's an actual academic update
        if (analysisResult && analysisResult.isAcademicUpdate) {
            const alertData = {
                ...analysisResult,
                groupName: chatName
            };
            await sendAcademicNotification(alertData);
            saveAlert(alertData);
            // Fire event for the desktop pet to intercept
            agentEvents.emit('academic-alert', alertData);
        }
    } catch (error) {
        console.error("Error during message processing:", error.message);
    } finally {
        isProcessingQueue = false;
        // Process next item if available
        processQueue();
    }
}

client.on('message_create', async (msg) => {
    try {
        const chatId = msg.fromMe ? msg.to : msg.from;
        const isGroup = chatId && chatId.endsWith('@g.us');

        if (!isGroup) return; // Ignore DMs completely

        // Try getting the chat from the already-in-memory chats cache:
        let chatName = "";
        try {
            const chats = await client.getChats();
            const targetChat = chats.find(c => c.id._serialized === chatId);
            chatName = targetChat ? targetChat.name : chatId;
        } catch (e) {
            chatName = chatId;
        }

        console.log(`\n[DEBUG] Detected message in Group ID: ${chatId}`);
        console.log(`[DEBUG] Resolved Group Name: "${chatName}"`);

        // Check if chatName or chatId matches any entry in config.targetGroupNames:
        if (config.targetGroupNames.length > 0) {
            const isTargetGroup = config.targetGroupNames.some(target => {
                const matchesName = chatName && chatName.toLowerCase().includes(target.toLowerCase().trim());
                const matchesId = chatId.includes(target.trim());
                return matchesName || matchesId;
            });

            console.log(`[DEBUG] Did it match your .env targets? ${isTargetGroup}`);
            if (!isTargetGroup) return;
        }

        // Extract message text:
        const messageText = msg.body || msg.caption || "";
        console.log(`[DEBUG] Message Text Length: ${messageText.trim().length}`);
        
        if (messageText.trim().length < 15) {
            console.log(`[DEBUG] Message ignored (too short): "${messageText}"`);
            return;
        }

        console.log(`[Group Message from "${chatName}"]: ${messageText.substring(0, 50)}...`);

        // Push to sequential processing queue
        messageQueue.push({ msg, chatName, messageText });
        processQueue();

    } catch (err) {
        console.error('Error in message listener:', err.stack || err);
    }
});

// Graceful shutdown handlers to prevent orphaned Chromium tasks
const cleanupAndExit = async () => {
    console.log('\nShutting down WhatsApp client gracefully...');
    try {
        await client.destroy();
        console.log('Client destroyed successfully.');
    } catch (e) {
        console.error('Error destroying client:', e.message);
    }
    process.exit(0);
};

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// Launch the client
console.log('Initializing WhatsApp client...');
client.initialize();

module.exports = { agentEvents };
