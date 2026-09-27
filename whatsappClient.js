const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-software-rasterizer'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('Scan the QR code below to link your WhatsApp account:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('WhatsApp session authentication successful!');
});

client.on('auth_failure', (msg) => {
    console.error('WhatsApp authentication failed:', msg);
    console.error('If the session is invalid, try deleting the "./.wwebjs_auth" directory and restart the agent.');
});

client.on('ready', () => {
    console.log('WhatsApp client is ready, authenticated, and listening for messages!');
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp client was disconnected. Reason:', reason);
});

module.exports = {
    client
};
