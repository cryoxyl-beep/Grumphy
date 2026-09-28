/**
 * Desktop Platformer Surface Engine (spatialEngine.js)
 * Replaces floating ratio offsets with rigid platform surfaces:
 * 1. Top Title Bar Ledge of the focused application window
 * 2. Floor (Windows Taskbar top edge) when on desktop or minimized
 */

const { screen } = require('electron');

const PET_WIDTH = 88;
const PET_HEIGHT = 88;
const SWARM_GAP = 95;

/**
 * Determines the contextual arrival state for companion pets based on window properties.
 * @param {Object} activeWindow - Window info { title, process }
 * @returns {{ pet1Action: string, pet2Action: string }}
 */
function getSurfaceActions(activeWindow) {
  const title = (activeWindow && activeWindow.title ? activeWindow.title.toLowerCase() : '');
  const proc = (activeWindow && activeWindow.process ? activeWindow.process.toLowerCase() : '');

  // Pet 1 (Scout) always calms into idle on the platform surface
  let pet1Action = 'state-idle';

  // Pet 2 (Operator) assumes contextual role
  let pet2Action = 'state-idle';
  if (
    title.includes('visual studio code') ||
    title.includes('vs code') ||
    title.includes('code') ||
    title.includes('terminal') ||
    title.includes('powershell') ||
    title.includes('cmd') ||
    proc.includes('code') ||
    proc.includes('terminal') ||
    proc.includes('powershell')
  ) {
    pet2Action = 'state-running'; // Laptop typing
  } else if (title.includes('meet.google.com') || title.includes('google meet') || title.includes('meet - ')) {
    pet2Action = 'state-waiting'; // Meeting listening
  }

  return { pet1Action, pet2Action };
}

/**
 * Calculates rigid platform surface target coordinates for both companion pets.
 * 
 * @param {Object} [activeWindow] - Focused window bounds { x, y, width, height, title, process }
 * @param {Object} [display] - Optional display object (defaults to primary display)
 * @returns {{ pet1: { x: number, y: number, surface: string, action: string }, pet2: { x: number, y: number, surface: string, action: string } }}
 */
function calculateSurfaceTargets(activeWindow, display = null) {
  let workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  try {
    const d = display || (screen && screen.getPrimaryDisplay ? screen.getPrimaryDisplay() : null);
    if (d && d.workArea) {
      workArea = d.workArea;
    }
  } catch (_) {}

  // Taskbar Floor: Windows Taskbar surface
  const FLOOR_Y = workArea.y + workArea.height - PET_HEIGHT;
  const { pet1Action, pet2Action } = getSurfaceActions(activeWindow);

  // Default Floor: Taskbar bottom right corner (desktop or minimized / explorer)
  if (
    !activeWindow ||
    activeWindow.process === 'explorer' ||
    !activeWindow.width ||
    activeWindow.width < 200 ||
    !activeWindow.height ||
    activeWindow.height < 150
  ) {
    return {
      pet1: {
        x: Math.max(workArea.x, workArea.x + workArea.width - 220),
        y: FLOOR_Y,
        surface: 'taskbar',
        action: 'state-idle'
      },
      pet2: {
        x: Math.max(workArea.x, workArea.x + workArea.width - 120),
        y: FLOOR_Y,
        surface: 'taskbar',
        action: 'state-idle'
      }
    };
  }

  // Ledge Surface: Sits on the TOP border of the active window
  // Pet sits right on top edge: y = activeWindow.y - PET_HEIGHT + 12 (slight overlap so feet touch ledge)
  let ledgeY = activeWindow.y - PET_HEIGHT + 12;

  // Safety Floor Clamp: Never let ledge drop below Taskbar Floor or above screen top
  if (ledgeY < workArea.y) {
    // If window is pushed to the very top edge, perch inside window top-right header
    ledgeY = activeWindow.y + 10;
  }
  ledgeY = Math.min(ledgeY, FLOOR_Y);
  ledgeY = Math.max(ledgeY, workArea.y);

  // Anchor near the top-right corner of the window
  const baseAnchorX = activeWindow.x + activeWindow.width - 240;

  const minX = workArea.x;
  const maxX1 = workArea.x + workArea.width - PET_WIDTH - SWARM_GAP;
  const maxX2 = workArea.x + workArea.width - PET_WIDTH;

  const target1X = Math.max(minX, Math.min(baseAnchorX, maxX1));
  const target2X = Math.max(minX, Math.min(baseAnchorX + SWARM_GAP, maxX2));

  return {
    pet1: {
      x: Math.round(target1X),
      y: Math.round(ledgeY),
      surface: 'app-top',
      action: pet1Action
    },
    pet2: {
      x: Math.round(target2X),
      y: Math.round(ledgeY),
      surface: 'app-top',
      action: pet2Action
    }
  };
}

module.exports = {
  PET_WIDTH,
  PET_HEIGHT,
  SWARM_GAP,
  calculateSurfaceTargets,
  getSurfaceActions
};
