require('dotenv').config();

const { GEMINI_API_KEY, TARGET_GROUP_NAMES, LOG_LEVEL } = process.env;

if (!GEMINI_API_KEY) {
    throw new Error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
}

const config = {
    geminiApiKey: GEMINI_API_KEY,
    targetGroupNames: TARGET_GROUP_NAMES ? TARGET_GROUP_NAMES.split(',').map(name => name.trim()) : [],
    logLevel: LOG_LEVEL || 'info'
};

module.exports = config;
