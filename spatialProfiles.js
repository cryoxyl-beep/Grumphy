/**
 * Spatial Profiles for Desktop Companion Swarm
 * Defines contextual UI waypoints, docking ratios, and contextual actions
 * for common Windows applications.
 */

const PROFILES = {
  meet: {
    name: 'Google Meet',
    pattern: /(meet\.google\.com|google meet|meet - )/i,
    ratioX: 0.50, // Center bottom over control capsule
    ratioY: 0.88,
    offsetY: -80,
    action: 'state-waiting' // Row 7: Attentive listening
  },
  whatsapp: {
    name: 'WhatsApp',
    pattern: /whatsapp/i,
    ratioX: 0.65, // Right side of chat input pill
    ratioY: 0.92,
    offsetY: -85,
    action: 'state-idle' // Row 1: Calm idle
  },
  vscode: {
    name: 'Visual Studio Code',
    pattern: /(visual studio code|vs code|\bcode\b|vsc)/i,
    ratioX: 0.82, // Perched on top-right tab bar / breadcrumb header
    ratioY: 0.08,
    offsetY: -75,
    action: 'state-running' // Row 8: Typing on mini-laptop
  },
  default: {
    name: 'Default Desktop / Application',
    pattern: /.*/,
    ratioX: 0.88, // Perched on top/bottom right above Taskbar
    ratioY: 0.02,
    offsetY: -75,
    action: 'state-idle' // Row 1: Calm idle
  }
};

/**
 * Matches a window title against known spatial profiles.
 * @param {string} title
 * @returns {Object} Matching profile definition
 */
function getProfileForTitle(title = '') {
  if (typeof title !== 'string' || !title.trim()) {
    return PROFILES.default;
  }
  const cleanTitle = title.trim();

  if (PROFILES.meet.pattern.test(cleanTitle)) {
    return PROFILES.meet;
  }
  if (PROFILES.whatsapp.pattern.test(cleanTitle)) {
    return PROFILES.whatsapp;
  }
  if (PROFILES.vscode.pattern.test(cleanTitle)) {
    return PROFILES.vscode;
  }
  return PROFILES.default;
}

/**
 * Calculates screen coordinates for a pet based on window bounds and profile.
 * Formula:
 *   Target X = bounds.x + (bounds.width * profile.ratioX) - (petWidth / 2)
 *   Target Y = bounds.y + (bounds.height * profile.ratioY) + profile.offsetY
 * 
 * @param {Object} bounds - Window rectangle { x, y, width, height }
 * @param {Object} profile - Profile definition with ratioX, ratioY, offsetY, action
 * @param {number} [petWidth=88] - Width of pet sprite in pixels
 * @param {Object} [screenBounds=null] - Optional workArea boundary { x, y, width, height }
 * @returns {{ x: number, y: number, action: string }}
 */
function calculateWaypoint(bounds, profile, petWidth = 88, screenBounds = null) {
  if (!bounds) {
    return { x: 0, y: 0, action: profile ? profile.action : 'state-idle' };
  }

  const p = profile || PROFILES.default;
  let targetX = bounds.x + (bounds.width * p.ratioX) - (petWidth / 2);
  let targetY = bounds.y + (bounds.height * p.ratioY) + p.offsetY;

  // Clamp within visible screen/workArea if available
  if (screenBounds) {
    const minX = screenBounds.x;
    const minY = screenBounds.y;
    const maxX = screenBounds.x + screenBounds.width - petWidth;
    const maxY = screenBounds.y + screenBounds.height - 88;

    targetX = Math.max(minX, Math.min(targetX, maxX));
    targetY = Math.max(minY, Math.min(targetY, maxY));
  }

  return {
    x: Math.round(targetX),
    y: Math.round(targetY),
    action: p.action
  };
}

module.exports = {
  PROFILES,
  getProfileForTitle,
  calculateWaypoint
};
