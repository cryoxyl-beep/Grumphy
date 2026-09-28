// Anti-Crash Shields: Prevent uncaught exceptions/rejections from killing the desktop pets
process.on('uncaughtException', (err) => {
  console.error('[Anti-Crash Shield] Uncaught exception prevented from crashing Electron:', err && (err.stack || err.message || err));
});

process.on('unhandledRejection', (reason) => {
  console.error('[Anti-Crash Shield] Unhandled rejection prevented from crashing Electron:', reason);
});

const { app, BrowserWindow, globalShortcut, ipcMain, session } = require('electron');
const petManager = require('./petManager');
const { askPetQuestion } = require('./aiAnalyzer');
const { generateSpeechAudio } = require('./ttsService');

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Spawn our multi-companion ecosystem (Pet 1 Scout & Pet 2 Operator)
  petManager.init();

  app.on('activate', function () {
    if (petManager.activePets.size === 0) {
      petManager.init();
    }
  });

  // Global hotkey to trigger voice listening on companions
  globalShortcut.register('Ctrl+Shift+Space', () => {
    petManager.broadcast('trigger-listen');
  });

  // Direct hotkey for Operator to trigger voice/text input
  globalShortcut.register('Ctrl+Alt+Space', () => {
    petManager.sendToRole('system', 'trigger-operator-command');
  });

  // Dynamic Window Click-Through
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, options);
    }
  });

  // Delta-based window movement for smooth drag physics
  ipcMain.on('move-pet-window', (event, delta, maybeDy) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    let dx = 0;
    let dy = 0;
    if (typeof delta === 'object' && delta !== null) {
      dx = delta.dx ?? delta.deltaX ?? delta.x ?? 0;
      dy = delta.dy ?? delta.deltaY ?? delta.y ?? 0;
    } else if (typeof delta === 'number') {
      dx = delta;
      dy = typeof maybeDy === 'number' ? maybeDy : 0;
    }
    const [currX, currY] = win.getPosition();
    win.setPosition(Math.round(currX + dx), Math.round(currY + dy));
  });

  // Absolute coordinate window movement (backwards compatible)
  ipcMain.on('window-move', (event, pos, maybeY) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    let x = 0;
    let y = 0;
    if (typeof pos === 'object' && pos !== null) {
      x = pos.x ?? pos.screenX ?? 0;
      y = pos.y ?? pos.screenY ?? 0;
    } else if (typeof pos === 'number') {
      x = pos;
      y = typeof maybeY === 'number' ? maybeY : 0;
    } else {
      return;
    }
    win.setPosition(Math.round(x), Math.round(y));
  });

  // AI Conversational Handlers
  const handleAskPet = async (event, questionText) => {
    if (!questionText || questionText.trim().length < 2) return "I didn't catch that.";
    return await askPetQuestion(questionText);
  };

  ipcMain.handle('ask-pet-question', handleAskPet);
  ipcMain.handle('ask-pet', handleAskPet);

  ipcMain.handle('ask-pet-audio', async (event, base64Audio) => {
    const { askPetAudio } = require('./aiAnalyzer');
    return await askPetAudio(base64Audio);
  });

  // High-fidelity Microsoft Edge Neural TTS
  ipcMain.handle('get-neural-tts', async (event, text, voice) => {
    return await generateSpeechAudio(text, voice || 'en-US-JennyNeural');
  });

  // Route incoming WhatsApp alerts directly to academic companion pets
  const { agentEvents } = require('./agent.js');
  agentEvents.on('academic-alert', (data) => {
    petManager.sendToRole('academic', 'academic-alert', data);
  });
});

app.on('before-quit', () => {
  petManager.setAppQuitting(true);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (petManager.isAppQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});
