const fs = require('fs');
const path = require('path');

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const level = process.env.LOG_LEVEL || 'debug';
const currentLevel = LOG_LEVELS[level.toLowerCase()] !== undefined ? LOG_LEVELS[level.toLowerCase()] : 0;

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function getLogFile() {
    const dateStr = new Date().toISOString().split('T')[0];
    return path.join(logDir, `operator-${dateStr}.log`);
}

function log(levelStr, tag, ...args) {
    if (LOG_LEVELS[levelStr] < currentLevel) return;
    const msgParts = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
    });
    const msg = msgParts.join(' ');
    const line = `[${new Date().toISOString()}] [${tag}] [${levelStr.toUpperCase()}] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(getLogFile(), line + '\n');
    } catch (e) {
        console.error("Logger append error:", e);
    }
}

module.exports = {
    debug: (tag, ...args) => log('debug', tag, ...args),
    info: (tag, ...args) => log('info', tag, ...args),
    warn: (tag, ...args) => log('warn', tag, ...args),
    error: (tag, ...args) => log('error', tag, ...args)
};
