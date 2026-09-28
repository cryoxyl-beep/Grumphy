const EventEmitter = require('events');
const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class SpatialTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pollInterval = options.pollInterval || 1200;
    this.timer = null;
    this.lastWindow = null;
    this.isTracking = false;
    this.customTrackerFn = null; // Used for mocking/testing
    this.excludedPids = new Set([process.pid]);
    this.exePath = path.join(__dirname, 'winTracker.exe');

    // Ensure native tracker binary is compiled if needed on Windows
    this._ensureNativeBinary();
  }

  _ensureNativeBinary() {
    if (process.platform !== 'win32') return;
    if (fs.existsSync(this.exePath)) return;
    const csPath = path.join(__dirname, 'winTracker.cs');
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (fs.existsSync(csPath) && fs.existsSync(cscPath)) {
      try {
        execSync(`"${cscPath}" /nologo /optimize+ /out:"${this.exePath}" "${csPath}"`, {
          windowsHide: true,
          stdio: 'pipe'
        });
        console.log('[spatialTracker] Native binary compiled successfully at', this.exePath);
      } catch (err) {
        console.error('[spatialTracker] Native binary compile FAILED:', err.message);
      }
    } else {
      console.error('[spatialTracker] csc.exe or winTracker.cs not found — csPath exists:', fs.existsSync(csPath), 'cscPath exists:', fs.existsSync(cscPath));
    }
  }

  addExcludedPid(pid) {
    if (pid) this.excludedPids.add(Number(pid));
  }

  removeExcludedPid(pid) {
    if (pid) this.excludedPids.delete(Number(pid));
  }

  /**
   * Normalizes raw native Win32 window bounds with Electron's primary display scale factor.
   * Handles 125%, 150%, 200% High-DPI Windows desktop scaling.
   * @param {Object} rawBounds - Native Win32 rectangle { x, y, width, height }
   * @returns {Object} Normalized rectangle in Electron DIP coordinates
   */
  normalizeBounds(rawBounds) {
    if (!rawBounds) return rawBounds;
    let scale = 1;
    try {
      const { screen } = require('electron');
      if (screen && screen.getPrimaryDisplay) {
        const display = screen.getPrimaryDisplay();
        scale = display.scaleFactor || 1;
      }
    } catch (err) { require('./logger').error('spatialTracker.js', err.message); }

    return {
      x: Math.round(rawBounds.x / scale),
      y: Math.round(rawBounds.y / scale),
      width: Math.round(rawBounds.width / scale),
      height: Math.round(rawBounds.height / scale)
    };
  }

  /**
   * Checks whether the given window should be ignored (e.g. self pet windows, minimized).
   */
  isIgnored(windowInfo) {
    if (!windowInfo || !windowInfo.title) return true;
    const title = windowInfo.title.trim();
    if (!title) return true;

    // Filter pet windows or internal dev processes
    const lower = title.toLowerCase();
    if (
      lower.includes('grumphy') ||
      lower.includes('whatsapp pet') ||
      lower.includes('electron') ||
      lower.includes('task manager') ||
      lower.includes('program manager')
    ) {
      return true;
    }

    if (windowInfo.processId && this.excludedPids.has(Number(windowInfo.processId))) {
      return true;
    }

    if (!windowInfo.bounds) return true;
    const { x, y, width, height } = windowInfo.bounds;
    if (width <= 50 || height <= 50 || x <= -30000 || y <= -30000) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates if a change occurred based on process change or >40px bounds shift.
   */
  hasSignificantChange(newInfo, oldInfo) {
    if (!newInfo) return false;
    if (!oldInfo) return true;
    const processChanged = newInfo.process !== oldInfo.process;
    const b1 = newInfo.bounds || {};
    const b2 = oldInfo.bounds || {};
    const threshold = 40;
    const moved = Math.abs((b1.x ?? 0) - (b2.x ?? 0)) > threshold ||
                  Math.abs((b1.y ?? 0) - (b2.y ?? 0)) > threshold ||
                  Math.abs((b1.width ?? 0) - (b2.width ?? 0)) > threshold ||
                  Math.abs((b1.height ?? 0) - (b2.height ?? 0)) > threshold;
    return processChanged || moved;
  }

  /**
   * Fetches the current foreground window info asynchronously with DPI normalization.
   */
  async getForegroundWindow() {
    if (this.customTrackerFn) {
      const customRes = await this.customTrackerFn();
      if (customRes && customRes.bounds) {
        customRes.bounds = this.normalizeBounds(customRes.bounds);
      }
      return customRes;
    }

    if (process.platform !== 'win32') {
      return null;
    }

    let rawInfo = null;

    // Attempt native binary execution first (~2ms)
    if (fs.existsSync(this.exePath)) {
      rawInfo = await new Promise((resolve) => {
        execFile(this.exePath, ['--once'], { windowsHide: true, timeout: 1000 }, (err, stdout) => {
          if (err || !stdout) return resolve(null);
          try {
            const raw = stdout.trim();
            if (!raw || raw === 'null') return resolve(null);
            resolve(JSON.parse(raw));
          } catch (_) {
            resolve(null);
          }
        });
      });
    }

    // PowerShell fallback
    if (!rawInfo) {
      rawInfo = await new Promise((resolve) => {
        const psCommand = `
          Add-Type -TypeDefinition @"
          using System;
          using System.Runtime.InteropServices;
          using System.Text;
          public class WinTrackerFallback {
              [StructLayout(LayoutKind.Sequential)]
              public struct RECT { public int Left, Top, Right, Bottom; }
              [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
              [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
              [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
              [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
              [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
              public static string Get() {
                  try {
                      SetProcessDpiAwarenessContext((IntPtr)(-4));
                  } catch {}
                  IntPtr hwnd = GetForegroundWindow();
                  if (hwnd == IntPtr.Zero || IsIconic(hwnd)) return "null";
                  StringBuilder sb = new StringBuilder(512);
                  GetWindowText(hwnd, sb, 512);
                  string title = sb.ToString().Trim();
                  if (string.IsNullOrEmpty(title)) return "null";
                  uint pid = 0;
                  GetWindowThreadProcessId(hwnd, out pid);
                  RECT r;
                  if (!GetWindowRect(hwnd, out r)) return "null";
                  int w = r.Right - r.Left; int h = r.Bottom - r.Top;
                  if (w <= 50 || h <= 50) return "null";
                  string clean = title.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"");
                  return "{\\"title\\":\\"" + clean + "\\",\\"processId\\":" + pid + ",\\"bounds\\":{\\"x\\":" + r.Left + ",\\"y\\":" + r.Top + ",\\"width\\":" + w + ",\\"height\\":" + h + "}}";
              }
          }
"@; [WinTrackerFallback]::Get()
        `;

        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], { windowsHide: true, timeout: 2000 }, (err, stdout) => {
          if (err || !stdout) return resolve(null);
          try {
            const raw = stdout.trim();
            if (!raw || raw === 'null') return resolve(null);
            resolve(JSON.parse(raw));
          } catch (_) {
            resolve(null);
          }
        });
      });
    }

    if (rawInfo && rawInfo.bounds) {
      rawInfo.bounds = this.normalizeBounds(rawInfo.bounds);
      // Determine friendly process name
      if (!rawInfo.process && rawInfo.title) {
        const lower = rawInfo.title.toLowerCase();
        if (lower.includes('visual studio code') || lower.includes('code')) rawInfo.process = 'code';
        else if (lower.includes('chrome')) rawInfo.process = 'chrome';
        else if (lower.includes('explorer')) rawInfo.process = 'explorer';
        else rawInfo.process = 'app';
      }
    }

    return rawInfo;
  }

  /**
   * Starts periodic polling for foreground window transitions.
   * Spatial tracking is completely disabled.
   */
  start(intervalMs) {
    this.stop();
    return;
  }

  /**
   * Stops periodic polling.
   */
  stop() {
    this.isTracking = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

const defaultTracker = new SpatialTracker();

module.exports = defaultTracker;
module.exports.SpatialTracker = SpatialTracker;
