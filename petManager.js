const { BrowserWindow, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const { executeAgentCommand } = require('./aiAnalyzer');
const spatialTracker = require('./spatialTracker');
const { calculateSurfaceTargets, PET_WIDTH, PET_HEIGHT, SWARM_GAP } = require('./spatialEngine');

// Register IPC handler for Operator companion task execution
try {
  ipcMain.removeHandler('execute-agent-task');
} catch (err) { require('./logger').error('petManager.js', err.message); }

ipcMain.handle('execute-agent-task', async (event, payload = {}) => {
  const query = typeof payload === 'string' ? payload : (payload && payload.query);
  return await executeAgentCommand(query, 'system');
});

// Guardrail: Cooldown timestamp for manual dragging (25-second priority pause)
let dragCooldownUntil = 0;

function handlePetDragStarted(petId) {
  // Instantly cancel any active autonomous navigation
  for (const pet of activePets.values()) {
    if (pet.navigationTimer) {
      clearInterval(pet.navigationTimer);
      pet.navigationTimer = null;
      pet.isNavigating = false;
    }
  }
  dragCooldownUntil = Date.now() + 25000; // 25-second complete cooldown
}

try {
  ipcMain.removeAllListeners('pet-drag-started');
} catch (err) { require('./logger').error('petManager.js', err.message); }

ipcMain.on('pet-drag-started', (event, data) => {
  const petId = (typeof data === 'object' && data) ? data.petId : data;
  handlePetDragStarted(petId);
});

const activePets = new Map();

let isAppQuitting = false;

function setAppQuitting(val) {
  isAppQuitting = !!val;
  if (val) {
    spatialTracker.stop();
    for (const pet of activePets.values()) {
      if (pet.navigationTimer) {
        clearInterval(pet.navigationTimer);
        pet.navigationTimer = null;
      }
    }
  }
}

/**
 * Navigates a pet companion to target surface coordinates using 60 FPS lerp interpolation,
 * velocity-linked directional running animations, and hard ground floor locks.
 * 
 * @param {string} petId - Target pet identifier ('pet-scout' or 'pet-operator')
 * @param {number} targetX - Destination screen X coordinate
 * @param {number} targetY - Destination screen Y coordinate
 * @param {string} [finalAction='state-idle'] - Action state to assume upon arrival
 * @param {Object} [options={}] - Optional tuning parameters (lerpFactor, onArrival)
 */
function navigatePet(petId, targetX, targetY, finalAction = 'state-idle', options = {}) {
  const pet = activePets.get(petId);
  if (!pet || !pet.win || pet.win.isDestroyed()) return;

  const win = pet.win;
  if (pet.navigationTimer) {
    clearInterval(pet.navigationTimer);
    pet.navigationTimer = null;
  }

  let workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  try {
    const primary = screen.getPrimaryDisplay();
    if (primary && primary.workArea) workArea = primary.workArea;
  } catch (err) { require('./logger').error('petManager.js', err.message); }

  // Hard Ground Lock: Y cannot exceed FLOOR_Y
  const FLOOR_Y = workArea.y + workArea.height - PET_HEIGHT;
  const clampedTargetY = Math.min(Math.max(targetY, workArea.y), FLOOR_Y);
  const clampedTargetX = Math.min(Math.max(targetX, workArea.x), workArea.x + workArea.width - PET_WIDTH);

  const [startX, startY] = win.getPosition();
  const initialDist = Math.hypot(clampedTargetX - startX, clampedTargetY - startY);

  // If already at destination (<= 4px), snap and transition immediately
  if (initialDist <= 4) {
    win.setPosition(Math.round(clampedTargetX), Math.round(clampedTargetY));
    if (!win.isDestroyed()) {
      win.webContents.send('set-pet-state', finalAction);
    }
    pet.isNavigating = false;
    if (typeof options.onArrival === 'function') {
      options.onArrival();
    }
    return;
  }

  pet.isNavigating = true;
  let currX = startX;
  let currY = startY;
  const lerpFactor = options.lerpFactor || 0.08;

  pet.navigationTimer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(pet.navigationTimer);
      pet.navigationTimer = null;
      return;
    }

    const nextX = currX + (clampedTargetX - currX) * lerpFactor;
    let nextY = currY + (clampedTargetY - currY) * lerpFactor;

    // Hard Ground Lock during flight
    nextY = Math.min(nextY, FLOOR_Y);

    const vx = clampedTargetX - currX;
    const remaining = Math.hypot(clampedTargetX - nextX, clampedTargetY - nextY);

    // Velocity-linked directional animation triggers
    if (vx > 2) {
      win.webContents.send('set-pet-state', 'state-run-right');
    } else if (vx < -2) {
      win.webContents.send('set-pet-state', 'state-run-left');
    }

    // Maintain global mouse pass-through for transparent canvas throughout movement
    try {
      win.setIgnoreMouseEvents(true, { forward: true });
    } catch (err) { require('./logger').error('petManager.js', err.message); }

    // Arrival at Surface Ledge: <= 4px snaps and halts lerp loop (0% idle CPU)
    if (remaining <= 4) {
      clearInterval(pet.navigationTimer);
      pet.navigationTimer = null;
      win.setPosition(Math.round(clampedTargetX), Math.round(clampedTargetY));
      win.webContents.send('set-pet-state', finalAction);
      pet.isNavigating = false;
      if (typeof options.onArrival === 'function') {
        options.onArrival();
      }
      return;
    }

    currX = nextX;
    currY = nextY;
    win.setPosition(Math.round(currX), Math.round(currY));
  }, 16); // ~60 FPS
}

/**
 * Handles foreground window transitions by calculating rigid platform surface waypoints
 * and coordinating step-by-step walking traversal for both pets.
 * 
 * @param {Object} windowInfo - Foreground window details { title, bounds, process, processId }
 * @param {Object} [options={}] - Optional traversal overrides
 */
function handleForegroundWindowChanged(windowInfo, options = {}) {
  if (Date.now() < dragCooldownUntil) {
    return;
  }

  let activeWindowParam = null;
  if (windowInfo && windowInfo.bounds) {
    activeWindowParam = {
      x: windowInfo.bounds.x,
      y: windowInfo.bounds.y,
      width: windowInfo.bounds.width,
      height: windowInfo.bounds.height,
      title: windowInfo.title,
      process: windowInfo.process
    };
  }

  let display = null;
  try {
    display = screen.getPrimaryDisplay();
  } catch (err) { require('./logger').error('petManager.js', err.message); }

  const targets = calculateSurfaceTargets(activeWindowParam, display);

  // Pet 1 (Scout) -> Top Ledge or Taskbar Floor (state-idle)
  navigatePet('pet-scout', targets.pet1.x, targets.pet1.y, targets.pet1.action, options);

  // Pet 2 (Operator) -> Top Ledge or Taskbar Floor (state-running if Code/Terminal, state-waiting/idle otherwise)
  navigatePet('pet-operator', targets.pet2.x, targets.pet2.y, targets.pet2.action, options);
}

/**
 * Spawns an independent pet companion window with crash resilience and auto-recovery.
 * @param {Object} options
 * @param {string} options.petId - Unique pet identifier.
 * @param {string} options.name - Display name of the pet.
 * @param {string} options.skinType - Skin identifier ('scout' or 'operator').
 * @param {string} options.role - Pet role ('academic' or 'system').
 * @param {number} options.startX - Initial screen X coordinate.
 * @param {number} options.startY - Initial screen Y coordinate.
 * @returns {BrowserWindow}
 */
function spawnPet({ petId, name, skinType, role, startX, startY }) {
  const width = 280;
  const height = 400;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(startX),
    y: Math.round(startY),
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

  // Windows 11 high-priority layer to prevent DWM minimizing behind other windows
  try {
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (_) {
    win.setAlwaysOnTop(true);
  }

  // Enable initial global mouse pass-through for transparent regions
  win.setIgnoreMouseEvents(true, { forward: true });

  // Load the shared view passing unique configuration via query params
  win.loadFile('index.html', {
    query: {
      petId,
      name,
      skinType,
      role
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    require('./logger').debug(`Renderer-${petId}`, `${message} (${sourceId}:${line})`);
  });

  let isDeliberatelyClosed = false;

  // Build context menu specifically for this pet instance
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${name} (${role})`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Mute Voice',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        if (!win.isDestroyed()) {
          win.webContents.send('toggle-mute', item.checked);
        }
      }
    },
    {
      label: 'Reset Position',
      click: () => {
        if (!win.isDestroyed()) {
          win.setPosition(Math.round(startX), Math.round(startY));
        }
      }
    },
    { type: 'separator' },
    {
      label: `Dismiss ${name}`,
      click: () => {
        if (!win.isDestroyed()) {
          isDeliberatelyClosed = true;
          win.close();
        }
      }
    },
    {
      label: 'Exit All Pets',
      click: () => {
        setAppQuitting(true);
        const { app } = require('electron');
        app.quit();
      }
    }
  ]);

  win.webContents.on('context-menu', (e, params) => {
    if (!win.isDestroyed()) {
      contextMenu.popup({ window: win, x: params.x, y: params.y });
    }
  });

  // Windows non-client right click handler (WM_NCRBUTTONUP = 0x00A5)
  win.hookWindowMessage(0x00A5, () => {
    if (!win.isDestroyed()) {
      contextMenu.popup({ window: win });
    }
  });

  // Resilience against renderer process crashes or GPU compositor resets
  win.webContents.on('render-process-gone', (event, details) => {
    console.error(`[petManager] Pet ${petId} render process gone: ${details.reason}. Recovering...`);
    if (!isAppQuitting && !isDeliberatelyClosed) {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.reload();
        }
      }, 1000);
    }
  });

  win.webContents.on('unresponsive', () => {
    console.warn(`[petManager] Pet ${petId} webContents unresponsive. Attempting recovery reload...`);
    if (!isAppQuitting && !isDeliberatelyClosed && !win.isDestroyed()) {
      win.reload();
    }
  });

  // Prevent Windows 11 shell (e.g. Win+D) from minimizing the pet
  win.on('minimize', (e) => {
    e.preventDefault();
    if (!win.isDestroyed()) {
      win.restore();
    }
  });

  // Auto-recovery: If closed unexpectedly, automatically respawn the companion!
  win.on('closed', () => {
    const petEntry = activePets.get(petId);
    if (petEntry && petEntry.navigationTimer) {
      clearInterval(petEntry.navigationTimer);
    }
    activePets.delete(petId);
    if (!isAppQuitting && !isDeliberatelyClosed) {
      console.warn(`[petManager] Pet ${petId} was closed unexpectedly. Auto-respawning in 1.5s...`);
      setTimeout(() => {
        if (!isAppQuitting && !activePets.has(petId)) {
          spawnPet({ petId, name, skinType, role, startX, startY });
        }
      }, 1500);
    }
  });

  activePets.set(petId, {
    win,
    config: { petId, name, skinType, role, startX, startY },
    navigationTimer: null,
    isNavigating: false
  });

  return win;
}

/**
 * Initializes the default 2-pet multi-companion ecosystem on startup.
 */
function init() {
  let workAreaSize = { width: 1920, height: 1080 };
  try {
    workAreaSize = screen.getPrimaryDisplay().workAreaSize;
  } catch (err) { require('./logger').error('petManager.js', err.message); }

  const width = 280;
  const height = 400;

  // Pet 1 (Scout): Ro-Yoyo skin, role: "academic"
  const scoutX = workAreaSize.width - width - 20;
  const scoutY = workAreaSize.height - height;
  spawnPet({
    petId: 'pet-scout',
    name: 'Grumphy Scout',
    skinType: 'scout',
    role: 'academic',
    startX: scoutX,
    startY: scoutY
  });

  // Pet 2 (Operator): New 9-row Sprite skin, role: "system"
  const operatorX = workAreaSize.width - (width * 2) - 30;
  const operatorY = workAreaSize.height - height;
  spawnPet({
    petId: 'pet-operator',
    name: 'Grumphy Operator',
    skinType: 'operator',
    role: 'system',
    startX: operatorX,
    startY: operatorY
  });
}

/**
 * Broadcasts an IPC message to all active pet windows.
 */
function broadcast(channel, data) {
  for (const { win } of activePets.values()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

/**
 * Sends an IPC message to pet windows matching a specific role.
 */
function sendToRole(role, channel, data) {
  for (const { win, config } of activePets.values()) {
    if (config.role === role && win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

/**
 * Sends an IPC message to a specific pet by ID.
 */
function sendToPet(petId, channel, data) {
  const pet = activePets.get(petId);
  if (pet && pet.win && !pet.win.isDestroyed()) {
    pet.win.webContents.send(channel, data);
  }
}

module.exports = {
  activePets,
  spawnPet,
  init,
  broadcast,
  sendToRole,
  sendToPet,
  navigatePet,
  handleForegroundWindowChanged,
  handlePetDragStarted,
  get dragCooldownUntil() { return dragCooldownUntil; },
  set dragCooldownUntil(val) { dragCooldownUntil = val; },
  spatialTracker,
  get isAppQuitting() { return isAppQuitting; },
  setAppQuitting
};
