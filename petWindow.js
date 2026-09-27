const { app, BrowserWindow, Menu, screen, globalShortcut, ipcMain, session } = require('electron');
const path = require('path');
const { askPetQuestion } = require('./aiAnalyzer');

let mainWindow;

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = 280;
  const height = 400;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    // Position it by default at the bottom-right corner just above the taskbar
    x: workAreaSize.width - width,
    y: workAreaSize.height - height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Support right-click context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mute',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        if (mainWindow) {
          mainWindow.webContents.send('toggle-mute', item.checked);
        }
      }
    },
    {
      label: 'Reset Position',
      click: () => {
        const { workAreaSize: currentWorkArea } = screen.getPrimaryDisplay();
        mainWindow.setPosition(currentWorkArea.width - width, currentWorkArea.height - height);
      }
    },
    { type: 'separator' },
    {
      label: 'Exit Pet',
      click: () => {
        app.quit();
      }
    }
  ]);

  mainWindow.webContents.on('context-menu', (e, params) => {
    contextMenu.popup({ window: mainWindow, x: params.x, y: params.y });
  });

  // On Windows, intercept non-client right click (WM_NCRBUTTONUP = 0x00A5)
  // which fires when right-clicking a drag region.
  mainWindow.hookWindowMessage(0x00A5, (wParam, lParam) => {
    contextMenu.popup({ window: mainWindow });
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true);
    } else {
      callback(false);
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  globalShortcut.register('Ctrl+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-listen');
    }
  });

  ipcMain.handle('ask-pet', async (event, questionText) => {
    return await askPetQuestion(questionText);
  });

  ipcMain.handle('ask-pet-audio', async (event, base64Audio) => {
    const { askPetAudio } = require('./aiAnalyzer');
    return await askPetAudio(base64Audio);
  });

  // Keep the existing WhatsApp agent running in the background.
  // We require it here so it doesn't block Electron's initial startup.
  const { agentEvents } = require('./agent.js');

  agentEvents.on('academic-alert', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('academic-alert', data);
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

