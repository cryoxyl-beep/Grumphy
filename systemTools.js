const { execFile, execFileSync, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Type } = require('@google/genai');
const { dialog, desktopCapturer, shell, clipboard, screen } = require('electron');
const logger = require('./logger');

const APP_COMMANDS = {
  'vs code': 'code',
  'code': 'code',
  'chrome': 'start chrome',
  'browser': 'start chrome',
  'notepad': 'notepad',
  'calculator': 'calc',
  'terminal': 'start powershell',
  'powershell': 'start powershell',
  'spotify': 'start spotify'
};

async function execFileWithTimeout(cmd, args, timeoutMs = 10000) {
    return new Promise((resolve) => {
        logger.debug('SystemTools', `Executing: ${cmd} ${args.join(' ')}`);
        const start = Date.now();
        const child = execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
            const duration = Date.now() - start;
            logger.debug('SystemTools', `Execution finished in ${duration}ms`, { cmd, args, err: err ? err.message : null });
            
            if (err && err.killed) {
                logger.error('SystemTools', `Command timed out after ${timeoutMs}ms: ${cmd}`);
                resolve({ success: false, error: `Command timed out after ${timeoutMs}ms` });
                return;
            }
            if (err) {
                logger.error('SystemTools', `Command failed: ${cmd}`, err.message);
                resolve({ success: false, error: err.message, stderr: stderr ? stderr.toString() : '' });
            } else {
                resolve({ success: true, message: stdout.toString().trim() || 'Command executed successfully.' });
            }
        });
    });
}

async function open_url({ url, browser = 'default' }) {
    if (!/^https?:\/\//i.test(url)) {
        return { success: false, error: "URL must start with http:// or https://" };
    }
    if (browser === 'default') {
        try {
            await shell.openExternal(url);
            return { success: true, message: `Opened ${url} in default browser.` };
        } catch (err) {
            logger.error('SystemTools', err);
            return { success: false, error: err.message };
        }
    } else {
        return await execFileWithTimeout('cmd', ['/c', 'start', '', browser, url]);
    }
}

async function openUrl(args) { return await open_url(args); }

async function launch_application({ appName }) {
    if (!appName) return { success: false, error: 'No target specified' };
    const target = appName.trim();
    if (target.toLowerCase() === 'spotify') {
        const res = await execFileWithTimeout('cmd', ['/c', 'start', '', 'spotify:']);
        if (res.success) return { success: true, message: 'Launched Spotify' };
    }
    return await execFileWithTimeout('cmd', ['/c', 'start', '', target]);
}

async function openApplication({ appName }) { return await launch_application({ appName }); }

async function close_application({ processName }) {
    if (!/^[A-Za-z0-9._-]+$/.test(processName)) {
        return { success: false, error: 'Invalid process name format.' };
    }
    const lower = processName.toLowerCase();
    if (lower.includes('electron') || lower.includes('node') || lower.includes('ollama') || lower.includes('explorer')) {
        return { success: false, error: `Refusing to kill critical process: ${processName}` };
    }

    const response = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm Kill Process',
        message: `Are you sure you want to forcibly close ${processName}?`
    });

    if (response.response !== 0) {
        return { success: false, error: 'User cancelled closing the application.' };
    }

    return await execFileWithTimeout('taskkill', ['/F', '/IM', processName]);
}

async function type_text({ text }) {
    const prevText = clipboard.readText();
    clipboard.writeText(text);
    
    const script = `
        $wshell = New-Object -ComObject wscript.shell
        $wshell.SendKeys("^v")
    `;
    const res = await execFileWithTimeout('powershell.exe', ['-NoProfile', '-Command', script]);
    
    setTimeout(() => {
        try { clipboard.writeText(prevText); } catch(err) { logger.error('SystemTools', err); }
    }, 500);

    return res.success ? { success: true, message: 'Typed text via clipboard.' } : res;
}

async function press_key({ key }) {
    const allowed = ['Enter', 'Tab', 'Escape', 'Up', 'Down', 'Left', 'Right', 'ctrl+a', 'ctrl+l'];
    if (!allowed.includes(key) && !allowed.includes(key.toLowerCase())) {
        return { success: false, error: `Key ${key} not in allowlist.` };
    }
    
    let sendStr = key;
    if (key.toLowerCase() === 'enter') sendStr = '{ENTER}';
    else if (key.toLowerCase() === 'tab') sendStr = '{TAB}';
    else if (key.toLowerCase() === 'escape') sendStr = '{ESC}';
    else if (key.toLowerCase() === 'up') sendStr = '{UP}';
    else if (key.toLowerCase() === 'down') sendStr = '{DOWN}';
    else if (key.toLowerCase() === 'left') sendStr = '{LEFT}';
    else if (key.toLowerCase() === 'right') sendStr = '{RIGHT}';
    else if (key.toLowerCase() === 'ctrl+a') sendStr = '^a';
    else if (key.toLowerCase() === 'ctrl+l') sendStr = '^l';

    const script = `
        $wshell = New-Object -ComObject wscript.shell
        $wshell.SendKeys("${sendStr}")
    `;
    return await execFileWithTimeout('powershell.exe', ['-NoProfile', '-Command', script]);
}

async function click_coordinate({ x, y }) {
    const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $signature = '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll",CharSet=CharSet.Auto, CallingConvention=CallingConvention.StdCall)] public static extern void mouse_event(long dwFlags, long dx, long dy, long cButtons, long dwExtraInfo); [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);'
        $type = Add-Type -MemberDefinition $signature -Name "Win32Mouse" -Namespace Win32Functions -PassThru
        $type::SetProcessDPIAware()
        $type::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
        $type::mouse_event(6, 0, 0, 0, 0)
    `;
    return await execFileWithTimeout('powershell.exe', ['-NoProfile', '-Command', script]);
}

async function take_screenshot({ destinationPath }) {
    try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const primary = sources[0];
        if (primary) {
            const img = primary.thumbnail.toPNG();
            fs.writeFileSync(destinationPath, img);
            return { success: true, message: `Screenshot saved to ${destinationPath}` };
        }
        return { success: false, error: 'No screen found.' };
    } catch (err) {
        logger.error('SystemTools', err);
        return { success: false, error: err.message };
    }
}

async function get_screen_image() {
    try {
        let display = null;
        let scaleFactor = 1;
        try {
            display = screen.getPrimaryDisplay();
            scaleFactor = display.scaleFactor || 1;
        } catch (err) { require('./logger').error('systemTools.js', err.message); }
        
        let width = 1920;
        let height = 1080;
        if (display && display.size) {
            width = display.size.width;
            height = display.size.height;
        }
        
        const scaledWidth = Math.round(width * scaleFactor);
        const scaledHeight = Math.round(height * scaleFactor);

        const sources = await desktopCapturer.getSources({ 
            types: ['screen'], 
            thumbnailSize: { width: scaledWidth, height: scaledHeight }
        });
        
        const primary = sources[0];
        if (primary) {
            let img = primary.thumbnail;
            const targetWidth = 1280;
            const targetHeight = Math.round(scaledHeight * (targetWidth / scaledWidth));
            img = img.resize({ width: targetWidth, height: targetHeight });
            
            return { success: true, buffer: img.toJPEG(85).toString('base64'), physicalWidth: scaledWidth, physicalHeight: scaledHeight };
        }
        return { success: false, error: 'No screen found.' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function searchWeb({ query }) {
    return await open_url({ url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
}

function getSystemDiagnostics() {
  const freeRamGb = (os.freemem() / (1024 ** 3)).toFixed(2);
  const totalRamGb = (os.totalmem() / (1024 ** 3)).toFixed(2);
  const uptime = Math.floor(os.uptime() / 60);
  return `Free RAM: ${freeRamGb} GB / Total RAM: ${totalRamGb} GB, Uptime: ${uptime} mins`;
}

async function createQuickNote(text) {
    if (typeof text === 'object' && text.text) text = text.text;
    const notesPath = path.resolve(__dirname, 'desktop_notes.txt');
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    fs.appendFileSync(notesPath, `[${now}] ${text}\n`, 'utf8');
    return { success: true, message: 'Appended note.' };
}

async function executeSystemTool(name, args = {}) {
    logger.debug('SystemTools', `Executing Tool: ${name}`, args);
    try {
        switch (name) {
            case 'launch_application': return await launch_application(args);
            case 'openApplication': return await openApplication(args);
            case 'open_url': return await open_url(args);
            case 'openUrl': return await openUrl(args);
            case 'close_application': return await close_application(args);
            case 'type_text': return await type_text(args);
            case 'press_key': return await press_key(args);
            case 'click_coordinate': return await click_coordinate(args);
            case 'take_screenshot': return await take_screenshot(args);
            case 'searchWeb': return await searchWeb(args);
            case 'getSystemDiagnostics': return getSystemDiagnostics(args);
            case 'createQuickNote': return await createQuickNote(args);
            default: return { success: false, error: `Tool "${name}" not recognized.` };
        }
    } catch (err) {
        logger.error('SystemTools', err);
        return { success: false, error: err.message };
    }
}

const AGENT_TOOLS = [
    { type: 'function', function: { name: 'open_url', description: 'Opens URL', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'openUrl', description: 'Opens URL', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'launch_application', description: 'Launch apps', parameters: { type: 'object', properties: { appName: { type: 'string' } }, required: ['appName'] } } },
    { type: 'function', function: { name: 'openApplication', description: 'Launch apps', parameters: { type: 'object', properties: { appName: { type: 'string' } }, required: ['appName'] } } },
    { type: 'function', function: { name: 'close_application', description: 'Close app', parameters: { type: 'object', properties: { processName: { type: 'string' } }, required: ['processName'] } } },
    { type: 'function', function: { name: 'type_text', description: 'Type text', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } },
    { type: 'function', function: { name: 'press_key', description: 'Press key', parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } } },
    { type: 'function', function: { name: 'click_coordinate', description: 'Click', parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } } },
    { type: 'function', function: { name: 'take_screenshot', description: 'Screenshot', parameters: { type: 'object', properties: { destinationPath: { type: 'string' } }, required: ['destinationPath'] } } },
    { type: 'function', function: { name: 'look_at_screen_and_find', description: 'Find UI element', parameters: { type: 'object', properties: { targetDescription: { type: 'string' } }, required: ["targetDescription"] } } },
    { type: 'function', function: { name: 'searchWeb', description: 'Search web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'getSystemDiagnostics', description: 'Diagnostics', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'createQuickNote', description: 'Quick note', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } }
];

const systemToolsDeclarations = AGENT_TOOLS.map(t => ({
    name: t.function.name,
    description: t.function.description,
    parameters: {
        type: Type.OBJECT,
        properties: Object.keys(t.function.parameters.properties || {}).reduce((acc, key) => {
            const pType = t.function.parameters.properties[key].type;
            acc[key] = { type: pType === 'string' ? Type.STRING : (pType === 'number' ? Type.NUMBER : Type.BOOLEAN) };
            return acc;
        }, {}),
        required: t.function.parameters.required || []
    }
}));

module.exports = {
    APP_COMMANDS,
    open_url,
    openUrl,
    launch_application,
    openApplication,
    close_application,
    type_text,
    press_key,
    click_coordinate,
    take_screenshot,
    get_screen_image,
    searchWeb,
    getSystemDiagnostics,
    createQuickNote,
    executeSystemTool,
    AGENT_TOOLS,
    tools: [{ functionDeclarations: systemToolsDeclarations }],
    systemToolsDeclarations,
    execFileWithTimeout
};
