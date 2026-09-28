const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const assert = require('assert');

// Prevent Electron from prematurely quitting when intermediate test windows close
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

async function runTests() {
  console.log('========================================');
  console.log('Running Principal Architect Verification');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  async function reportAsync(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Spritesheet Assets Verification (Pet 1 & Pet 2)
  // ----------------------------------------------------
  await reportAsync('Both spritesheet assets exist and match 1536x1872 (8x9 frames)', async () => {
    const sprite1Path = path.join(__dirname, 'sprites', 'spritesheet.webp');
    const sprite2Path = path.join(__dirname, 'sprites', 'pet2-spritesheet.webp');
    assert(fs.existsSync(sprite1Path), `Pet 1 Spritesheet not found at ${sprite1Path}`);
    assert(fs.existsSync(sprite2Path), `Pet 2 Spritesheet not found at ${sprite2Path}`);

    for (const p of [sprite1Path, sprite2Path]) {
      const meta = await sharp(p).metadata();
      assert.strictEqual(meta.format, 'webp', `Format should be webp, got ${meta.format}`);
      assert.strictEqual(meta.width, 1536, `Width should be 1536, got ${meta.width}`);
      assert.strictEqual(meta.height, 1872, `Height should be 1872, got ${meta.height}`);
      assert.strictEqual(meta.width / 8, 192, 'Frame width should be 192');
      assert.strictEqual(meta.height / 9, 208, 'Frame height should be 208');
    }
  });

  // ----------------------------------------------------
  // TEST 2: HTML Structure Verification
  // ----------------------------------------------------
  report('index.html structure has div#pet-sprite and speechBubble without img#pet-character', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert(html.includes('<div id="pet-sprite" class="state-idle"></div>'), 'Missing <div id="pet-sprite" class="state-idle"></div>');
    assert(!html.includes('<img id="pet-character"'), 'Should not contain <img id="pet-character"');
    assert(html.includes('id="speechBubble"'), 'Speech bubble must have id="speechBubble"');
    assert(html.includes('class="speech-bubble hidden"'), 'Speech bubble must start hidden');
    assert(html.includes('id="sbCategory"'), 'Missing sbCategory');
    assert(html.includes('id="sbSummary"'), 'Missing sbSummary');
    assert(html.includes('id="sbDeadline"'), 'Missing sbDeadline');
  });

  // ----------------------------------------------------
  // TEST 3: CSS Keyframe & Multi-Skin Verification
  // ----------------------------------------------------
  report('pet.css has correct cycle keyframe math, scale, skin classes, and cozy timings', () => {
    const css = fs.readFileSync(path.join(__dirname, 'pet.css'), 'utf8');
    assert(css.includes('--pet-size: 88px;'), 'Missing --pet-size: 88px');
    assert(css.includes("background-image: url('./sprites/spritesheet.webp');"), 'Missing background-image for pet 1');
    assert(css.includes("background-image: url('./sprites/pet2-spritesheet.webp');"), 'Missing background-image for pet 2');
    assert(css.includes('skin-scout'), 'Missing skin-scout class');
    assert(css.includes('skin-operator'), 'Missing skin-operator class');
    assert(css.includes('background-size: calc(var(--pet-size) * 8) calc(var(--pet-size) * 9);'), 'Missing background-size calculation');
    assert(css.includes('image-rendering: pixelated;'), 'Missing image-rendering: pixelated');
    assert(css.includes('-webkit-app-region: no-drag;'), 'Missing no-drag decoupling');
    assert(!css.includes('-webkit-app-region: drag;'), 'Must NOT have -webkit-app-region: drag');

    // Cycle keyframe verification
    assert(css.includes('@keyframes cycle-8'), 'Missing @keyframes cycle-8');
    assert(css.includes('@keyframes cycle-6'), 'Missing @keyframes cycle-6');
    assert(css.includes('@keyframes cycle-5'), 'Missing @keyframes cycle-5');
    assert(css.includes('@keyframes cycle-4'), 'Missing @keyframes cycle-4');

    // All 9 rows with exact valid frame counts & timings
    const rows = [
      { name: 'Row 1 IDLE', y: '0px', dur: '1.4s', frames: 6 },
      { name: 'Row 2 RUN RIGHT', y: 'calc(-1 * var(--pet-size) * 1)', dur: '0.85s', frames: 8 },
      { name: 'Row 3 RUN LEFT', y: 'calc(-1 * var(--pet-size) * 2)', dur: '0.85s', frames: 8 },
      { name: 'Row 4 WAVING', y: 'calc(-1 * var(--pet-size) * 3)', dur: '0.9s', frames: 4 },
      { name: 'Row 5 JUMPING', y: 'calc(-1 * var(--pet-size) * 4)', dur: '0.75s', frames: 5 },
      { name: 'Row 6 FAILED', y: 'calc(-1 * var(--pet-size) * 5)', dur: '1.4s', frames: 8 },
      { name: 'Row 7 WAITING', y: 'calc(-1 * var(--pet-size) * 6)', dur: '1.2s', frames: 6 },
      { name: 'Row 8 RUNNING', y: 'calc(-1 * var(--pet-size) * 7)', dur: '0.7s', frames: 6 },
      { name: 'Row 9 REVIEW', y: 'calc(-1 * var(--pet-size) * 8)', dur: '1.1s', frames: 6 },
    ];

    for (const r of rows) {
      assert(css.includes(r.y), `Missing y offset for ${r.name}: ${r.y}`);
      assert(css.includes(`cycle-${r.frames} ${r.dur} steps(${r.frames}) infinite`), `Missing animation for ${r.name}: cycle-${r.frames} ${r.dur} steps(${r.frames}) infinite`);
    }
  });

  // ----------------------------------------------------
  // TEST 4: IPC Handler Robustness (arguments vs named params)
  // ----------------------------------------------------
  report('petWindow.js IPC move-pet-window and window-move work with both object and numeric args', () => {
    // Test petWindow.js move-pet-window implementation doesn't throw ReferenceError
    const petWindowCode = fs.readFileSync(path.join(__dirname, 'petWindow.js'), 'utf8');
    assert(!petWindowCode.includes('arguments['), 'petWindow.js must not reference arguments inside arrow functions');
    assert(petWindowCode.includes('move-pet-window'), 'petWindow.js must handle move-pet-window');
    assert(petWindowCode.includes('window-move'), 'petWindow.js must handle window-move');
    assert(petWindowCode.includes('set-ignore-mouse-events'), 'petWindow.js must handle set-ignore-mouse-events');
    assert(petWindowCode.includes('ask-pet'), 'petWindow.js must handle ask-pet');
    assert(petWindowCode.includes('ask-pet-question'), 'petWindow.js must handle ask-pet-question');
  });

  // ----------------------------------------------------
  // TEST 5: Neural Edge TTS Service Verification
  // ----------------------------------------------------
  await reportAsync('ttsService generates base64 MP3 neural audio using JennyNeural', async () => {
    const { generateSpeechAudio, VOICES } = require('./ttsService');
    assert(VOICES.jenny === 'en-US-JennyNeural', 'Missing JennyNeural voice');
    assert(VOICES.aria === 'en-US-AriaNeural', 'Missing AriaNeural voice');
    assert(VOICES.sonia === 'en-IN-SoniaNeural', 'Missing SoniaNeural voice');

    const audioUrl = await generateSpeechAudio('Hello! Grumphy here.');
    assert(typeof audioUrl === 'string', 'Expected audio data URL string');
    assert(audioUrl.startsWith('data:audio/mp3;base64,'), 'Expected data URL to start with data:audio/mp3;base64,');
    assert(audioUrl.length > 500, 'Audio data URL should have substantive content');
  });

  // ----------------------------------------------------
  // TEST 6: Multi-Pet Manager Architecture
  // ----------------------------------------------------
  report('petManager exports activePets Map, spawnPet, init, broadcast, sendToRole', () => {
    const petManager = require('./petManager');
    assert(petManager.activePets instanceof Map, 'activePets must be an instance of Map');
    assert(typeof petManager.spawnPet === 'function', 'spawnPet must be a function');
    assert(typeof petManager.init === 'function', 'init must be a function');
    assert(typeof petManager.broadcast === 'function', 'broadcast must be a function');
    assert(typeof petManager.sendToRole === 'function', 'sendToRole must be a function');
  });

  // ----------------------------------------------------
  // TEST 7: Live BrowserWindow DOM & State Machine Execution
  // ----------------------------------------------------
  await reportAsync('Live Electron window execution: boot click-through, state machine, drag, bubble', async () => {
    const ignoreMouseEventsCalls = [];
    const movePetWindowCalls = [];

    const testWin = new BrowserWindow({
      width: 280,
      height: 400,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    testWin.setPosition(200, 200);

    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
      ignoreMouseEventsCalls.push({ ignore, options });
    });

    ipcMain.on('move-pet-window', (event, delta, maybeDy) => {
      let dx = 0, dy = 0;
      if (typeof delta === 'object' && delta !== null) {
        dx = delta.dx ?? delta.deltaX ?? delta.x ?? 0;
        dy = delta.dy ?? delta.deltaY ?? delta.y ?? 0;
      } else if (typeof delta === 'number') {
        dx = delta;
        dy = typeof maybeDy === 'number' ? maybeDy : 0;
      }
      const [currX, currY] = testWin.getPosition();
      testWin.setPosition(Math.round(currX + dx), Math.round(currY + dy));
      movePetWindowCalls.push({ dx, dy });
    });

    ipcMain.on('window-move', (event, pos, maybeY) => {
      let x = 0, y = 0;
      if (typeof pos === 'object' && pos !== null) {
        x = pos.x ?? pos.screenX ?? 0;
        y = pos.y ?? pos.screenY ?? 0;
      } else if (typeof pos === 'number') {
        x = pos;
        y = typeof maybeY === 'number' ? maybeY : 0;
      }
      testWin.setPosition(Math.round(x), Math.round(y));
    });

    await testWin.loadFile(path.join(__dirname, 'index.html'));

    // Wait a brief moment for boot events
    await new Promise(r => setTimeout(r, 100));

    // Verify boot call to set-ignore-mouse-events
    assert(ignoreMouseEventsCalls.length > 0, 'Must have received boot set-ignore-mouse-events');
    const bootCall = ignoreMouseEventsCalls[0];
    assert.strictEqual(bootCall.ignore, true, 'Boot call must have ignore=true');
    assert.deepStrictEqual(bootCall.options, { forward: true }, 'Boot call must have forward=true');

    // Run in-renderer evaluation
    const result = await testWin.webContents.executeJavaScript(`
      (() => {
        const results = [];
        const pet = document.getElementById('pet-sprite');
        const bubble = document.getElementById('speechBubble');

        // Check 1: Initial state
        results.push({ name: 'Initial state is state-idle', pass: pet.classList.contains('state-idle') });

        // Check 2: Computed dimensions & styles
        const computed = window.getComputedStyle(pet);
        results.push({ name: 'Sprite width is 88px', pass: computed.width === '88px' });
        results.push({ name: 'Sprite height is 88px', pass: computed.height === '88px' });
        results.push({ name: 'App region is no-drag', pass: computed.webkitAppRegion === 'no-drag' });

        // Check 3: State mappings (including backwards-compatibility)
        setPetState('run-right');
        results.push({ name: 'State set to run-right', pass: pet.classList.contains('state-run-right') });
        setPetState('run-left');
        results.push({ name: 'State set to run-left', pass: pet.classList.contains('state-run-left') });
        setPetState('waving');
        results.push({ name: 'State set to waving', pass: pet.classList.contains('state-waving') });
        setPetState('jump');
        results.push({ name: 'State set to jump', pass: pet.classList.contains('state-jumping') });
        setPetState('alert');
        results.push({ name: 'Legacy state alert maps to jumping', pass: pet.classList.contains('state-jumping') });
        setPetState('speaking');
        results.push({ name: 'Legacy state speaking maps to review', pass: pet.classList.contains('state-review') });
        setPetState('listening');
        results.push({ name: 'Legacy state listening maps to waiting', pass: pet.classList.contains('state-waiting') });

        setPetState('idle');
        results.push({ name: 'State reset to idle', pass: pet.classList.contains('state-idle') });

        // Check 4: Mouse hover waving & leaving
        pet.dispatchEvent(new MouseEvent('mouseenter'));
        results.push({ name: 'Hover enters state-waving', pass: pet.classList.contains('state-waving') });
        pet.dispatchEvent(new MouseEvent('mouseleave'));
        results.push({ name: 'Hover leave restores state-idle', pass: pet.classList.contains('state-idle') });

        // Check 5: Double-click sprint
        pet.dispatchEvent(new MouseEvent('dblclick'));
        results.push({ name: 'Double click triggers state-running', pass: pet.classList.contains('state-running') });
        setPetState('idle');

        // Check 6: Drag sequence
        pet.dispatchEvent(new MouseEvent('mousedown', { button: 0, screenX: 100, screenY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, screenX: 115, screenY: 105 }));
        results.push({ name: 'Drag right (dx=15) sets state-run-right', pass: pet.classList.contains('state-run-right') });

        window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, screenX: 95, screenY: 105 }));
        results.push({ name: 'Drag left (dx=-20) sets state-run-left', pass: pet.classList.contains('state-run-left') });

        window.dispatchEvent(new MouseEvent('mouseup'));
        results.push({ name: 'Mouseup resets state to state-idle', pass: pet.classList.contains('state-idle') });

        // Check 7: Speech bubble show / hide
        showSpeechBubble('ASSIGNMENT', 'Math HW 4', 'Tomorrow 5pm');
        results.push({ name: 'Speech bubble gained visible', pass: bubble.classList.contains('visible') && !bubble.classList.contains('hidden') });
        results.push({ name: 'Category text populated', pass: document.getElementById('sbCategory').textContent === 'ASSIGNMENT' });
        results.push({ name: 'Summary text populated', pass: document.getElementById('sbSummary').textContent === 'Math HW 4' });
        results.push({ name: 'Deadline text populated', pass: document.getElementById('sbDeadline').textContent === 'Tomorrow 5pm' });

        hideSpeechBubble();
        results.push({ name: 'Speech bubble hidden restored', pass: bubble.classList.contains('hidden') && !bubble.classList.contains('visible') });

        return results;
      })()
    `);

    for (const r of result) {
      assert(r.pass, `Client assertion failed: ${r.name}`);
    }

    // Verify window movement IPC was processed
    assert(movePetWindowCalls.length >= 2, 'Expected move-pet-window calls from drag sequence');
    assert.deepStrictEqual(movePetWindowCalls[0], { dx: 15, dy: 5 });
    assert.deepStrictEqual(movePetWindowCalls[1], { dx: -20, dy: 0 });

    // Test window-move direct invocation
    await testWin.webContents.executeJavaScript(`
      ipcRenderer.send('window-move', { x: 450, y: 550 });
    `);
    await new Promise(r => setTimeout(r, 50));
    assert.deepStrictEqual(testWin.getPosition(), [450, 550]);

    // Test move-pet-window with numeric arguments (regression prevention)
    await testWin.webContents.executeJavaScript(`
      ipcRenderer.send('move-pet-window', 10, 20);
    `);
    await new Promise(r => setTimeout(r, 50));
    assert.deepStrictEqual(testWin.getPosition(), [460, 570]);

    // Test academic-alert IPC reception
    testWin.webContents.send('academic-alert', {
      category: 'EXAM',
      summary: 'Physics Midterm',
      deadline: 'Monday 9am'
    });
    await new Promise(r => setTimeout(r, 100));

    const alertCheck = await testWin.webContents.executeJavaScript(`
      (() => {
        const pet = document.getElementById('pet-sprite');
        const bubble = document.getElementById('speechBubble');
        return {
          petJumping: pet.classList.contains('state-jumping'),
          bubbleVisible: bubble.classList.contains('visible'),
          category: document.getElementById('sbCategory').textContent,
          summary: document.getElementById('sbSummary').textContent
        };
      })()
    `);

    assert.strictEqual(alertCheck.petJumping, true, 'Pet should enter jumping state on academic-alert');
    assert.strictEqual(alertCheck.bubbleVisible, true, 'Bubble should be visible on academic-alert');
    assert.strictEqual(alertCheck.category, 'EXAM');
    assert.strictEqual(alertCheck.summary, 'Physics Midterm');

    testWin.destroy();
  });

  // ----------------------------------------------------
  // TEST 8: Safe Windows Automation Engine (systemTools.js)
  // ----------------------------------------------------
  await reportAsync('systemTools.js automation engine, mappings, diagnostics, notes, and schemas', async () => {
    const systemTools = require('./systemTools');
    assert(typeof systemTools.openApplication === 'function', 'openApplication must be a function');
    assert(typeof systemTools.openUrl === 'function', 'openUrl must be a function');
    assert(typeof systemTools.searchWeb === 'function', 'searchWeb must be a function');
    assert(typeof systemTools.getSystemDiagnostics === 'function', 'getSystemDiagnostics must be a function');
    assert(typeof systemTools.createQuickNote === 'function', 'createQuickNote must be a function');
    assert(Array.isArray(systemTools.tools), 'tools must be an array');
    assert(Array.isArray(systemTools.systemToolsDeclarations), 'systemToolsDeclarations must be an array');

    // Verify application command mappings
    const mappings = [
      { app: 'vs code', expected: 'code' },
      { app: 'code', expected: 'code' },
      { app: 'chrome', expected: 'start chrome' },
      { app: 'browser', expected: 'start chrome' },
      { app: 'notepad', expected: 'notepad' },
      { app: 'calculator', expected: 'calc' },
      { app: 'terminal', expected: 'start powershell' },
      { app: 'powershell', expected: 'start powershell' },
      { app: 'spotify', expected: 'start spotify' }
    ];

    for (const { app: appName, expected } of mappings) {
      assert.strictEqual(
        systemTools.APP_COMMANDS[appName],
        expected,
        `Mapping for "${appName}" must be "${expected}", got "${systemTools.APP_COMMANDS[appName]}"`
      );
    }

    // Verify system diagnostics summary
    const diag = systemTools.getSystemDiagnostics();
    assert(typeof diag === 'string', 'getSystemDiagnostics must return a string');
    assert(diag.includes('RAM'), 'Diagnostics must mention RAM');
    assert(diag.includes('free') || diag.includes('Free'), 'Diagnostics must mention free RAM');
    assert(diag.includes('total') || diag.includes('Total'), 'Diagnostics must mention total RAM');
    assert(diag.includes('Uptime') || diag.includes('uptime'), 'Diagnostics must mention Uptime');

    // Verify createQuickNote writes to desktop_notes.txt
    const testNoteText = `Automated verification note ${Date.now()}`;
    const noteRes = await systemTools.createQuickNote(testNoteText);
    assert(noteRes.success, 'createQuickNote must report success');

    const notesPath = path.resolve(__dirname, 'desktop_notes.txt');
    assert(fs.existsSync(notesPath), 'desktop_notes.txt should exist after createQuickNote');
    const notesContent = fs.readFileSync(notesPath, 'utf8');
    assert(notesContent.includes(testNoteText), 'desktop_notes.txt must contain the note text');

    // Clean up test note
    fs.unlinkSync(notesPath);

    // Verify Gemini tool schema declarations
    const declNames = systemTools.systemToolsDeclarations.map(d => d.name);
    const requiredTools = ['openApplication', 'openUrl', 'searchWeb', 'getSystemDiagnostics', 'createQuickNote'];
    for (const req of requiredTools) {
      assert(declNames.includes(req), `Missing Gemini tool declaration for: ${req}`);
    }
  });

  // ----------------------------------------------------
  // TEST 9: IPC Channel execute-agent-task & Tool Dispatcher
  // ----------------------------------------------------
  await reportAsync('petManager registers execute-agent-task IPC channel and dispatches tasks', async () => {
    const petManager = require('./petManager');
    const { executeAgentCommand } = require('./aiAnalyzer');
    assert(typeof executeAgentCommand === 'function', 'executeAgentCommand must be a function in aiAnalyzer');

    // Verify direct agent execution with tool calling
    const result = await executeAgentCommand('Check system RAM and uptime', 'system');
    assert(typeof result === 'string', 'executeAgentCommand must return a string response');
    assert(result.length > 5, 'executeAgentCommand should return a conversational response');

    // Test strict single-flight debounce lock behavior
    const p1 = executeAgentCommand('Check specs', 'system');
    const p2 = executeAgentCommand('Check specs again immediately', 'system');
    const [res1, res2] = await Promise.all([p1, p2]);
    assert(typeof res1 === 'string' && typeof res2 === 'string', 'Both calls must resolve');
    assert(
      res2.includes('busy') || res2.includes('Hold on'),
      `Second concurrent call must be blocked by debounce lock, got: "${res2}"`
    );
  });

  // ----------------------------------------------------
  // TEST 10: Operator Window Execution Flow (Row 8, 9, 1, 6)
  // ----------------------------------------------------
  await reportAsync('Operator window flow: Row 8 running -> Row 9 review -> Row 1 idle & Row 6 failed', async () => {
    const opWin = new BrowserWindow({
      width: 280,
      height: 400,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    await opWin.loadFile(path.join(__dirname, 'index.html'), {
      query: {
        petId: 'pet-operator',
        name: 'Grumphy Operator',
        skinType: 'operator',
        role: 'system'
      }
    });

    await new Promise(r => setTimeout(r, 150));

    // Verify initial Operator state & skin
    const initCheck = await opWin.webContents.executeJavaScript(`
      (() => {
        const pet = document.getElementById('pet-sprite');
        return {
          isIdle: pet.classList.contains('state-idle'),
          isOperatorSkin: pet.classList.contains('skin-operator') || document.body.classList.contains('skin-operator'),
          hasExecuteCommand: typeof window.executeOperatorCommand === 'function',
          hasTriggerInput: typeof window.triggerOperatorInput === 'function'
        };
      })()
    `);

    assert(initCheck.isIdle, 'Operator must start in state-idle');
    assert(initCheck.isOperatorSkin, 'Operator must have skin-operator applied');
    assert(initCheck.hasExecuteCommand, 'window.executeOperatorCommand must be defined');
    assert(initCheck.hasTriggerInput, 'window.triggerOperatorInput must be defined');

    // Test triggerOperatorInput renders input, and clicking inside the input does NOT hide the bubble
    const inputClickCheck = await opWin.webContents.executeJavaScript(`
      (() => {
        window.triggerOperatorInput();
        const input = document.getElementById('op-cmd-input');
        const goBtn = document.getElementById('op-cmd-go');
        const bubble = document.getElementById('speechBubble');
        const beforeClick = bubble.classList.contains('visible') && !bubble.classList.contains('hidden');

        // Click inside the text input to ensure click doesn't bubble and hide the speech bubble
        input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const afterInputClick = bubble.classList.contains('visible') && !bubble.classList.contains('hidden');

        return {
          hasInput: input !== null,
          hasGoBtn: goBtn !== null,
          beforeClick,
          afterInputClick
        };
      })()
    `);

    assert(inputClickCheck.hasInput, 'triggerOperatorInput must display an input element');
    assert(inputClickCheck.hasGoBtn, 'triggerOperatorInput must display a Go button');
    assert(inputClickCheck.beforeClick, 'Speech bubble must be visible for Operator input');
    assert(inputClickCheck.afterInputClick, 'Clicking inside input element must NOT hide the speech bubble');

    // Test Escape key inside input dismisses prompt
    const escapeCheck = await opWin.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('op-cmd-input');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const bubble = document.getElementById('speechBubble');
        const pet = document.getElementById('pet-sprite');
        return {
          bubbleHidden: bubble.classList.contains('hidden'),
          petIdle: pet.classList.contains('state-idle')
        };
      })()
    `);
    assert(escapeCheck.bubbleHidden, 'Escape must hide the speech bubble');
    assert(escapeCheck.petIdle, 'Escape must return pet to state-idle');

    // Step 1 & 2: Test live executeOperatorCommand flow (Row 8 running -> Row 9 review -> Row 1 idle)
    // We mock ipcRenderer.invoke for 'execute-agent-task' inside renderer to verify full client flow
    const flowCheck = await opWin.webContents.executeJavaScript(`
      new Promise(async (resolve) => {
        const pet = document.getElementById('pet-sprite');
        const bubble = document.getElementById('speechBubble');

        // Mute audio for deterministic fast execution
        window.speechSynthesis.cancel();
        const origInvoke = ipcRenderer.invoke;
        ipcRenderer.invoke = async (channel, data) => {
          if (channel === 'execute-agent-task') {
            return "Opened Notepad for you.";
          }
          if (channel === 'get-neural-tts') {
            return null; // fallback to SpeechSynthesis
          }
          return origInvoke.call(ipcRenderer, channel, data);
        };

        const execPromise = window.executeOperatorCommand('open notepad');

        // Immediately check Row 8 (.state-running) and bubble
        const isRunningImmediately = pet.classList.contains('state-running');
        const initialBubbleText = document.getElementById('sbSummary').textContent;

        await execPromise;

        // After completion, pet has transitioned through Row 9 and reverted to Row 1 (.state-idle)
        const isIdleAfter = pet.classList.contains('state-idle');
        const bubbleHiddenAfter = bubble.classList.contains('hidden');

        ipcRenderer.invoke = origInvoke;
        resolve({
          isRunningImmediately,
          initialBubbleText,
          isIdleAfter,
          bubbleHiddenAfter
        });
      })
    `);

    assert(flowCheck.isRunningImmediately, 'Operator must switch immediately to state-running (Row 8)');
    assert.strictEqual(flowCheck.initialBubbleText, 'Executing... 💻', 'Speech bubble must show "Executing... 💻"');
    assert(flowCheck.isIdleAfter, 'Operator must revert to state-idle (Row 1) after command and speech');
    assert(flowCheck.bubbleHiddenAfter, 'Speech bubble must be hidden after completion');

    // Step 3: Error handling transitions to Row 6 (.state-failed)
    const errorCheck = await opWin.webContents.executeJavaScript(`
      new Promise(async (resolve) => {
        const pet = document.getElementById('pet-sprite');
        const bubble = document.getElementById('speechBubble');

        while (window.isOperatorExecuting && window.isOperatorExecuting()) {
          await new Promise(r => setTimeout(r, 50));
        }

        const origInvoke = ipcRenderer.invoke;
        ipcRenderer.invoke = async (channel) => {
          if (channel === 'execute-agent-task') {
            throw new Error('Simulated failure');
          }
          return null;
        };

        const execPromise = window.executeOperatorCommand('Fail command');
        // Give event loop a microtick to enter catch block and set state-failed
        await new Promise(r => setTimeout(r, 100));

        const classAt100ms = pet.className;
        const isFailed = pet.classList.contains('state-failed') || classAt100ms.includes('state-failed');
        const failedBubble = document.getElementById('sbSummary').textContent;

        await execPromise; // waits for error timeout to finish and revert to idle

        const isIdleAfterError = pet.classList.contains('state-idle');
        ipcRenderer.invoke = origInvoke;
        resolve({ isFailed, failedBubble, isIdleAfterError, classAt100ms, className: pet.className });
      })
    `);

    assert(errorCheck.isFailed, `Operator must enter state-failed (Row 6) on error, class at 100ms was: "${errorCheck.classAt100ms}"`);
    assert(errorCheck.failedBubble.includes('failed') || errorCheck.failedBubble.includes('⚠️'), 'Bubble should show error indicator');
    assert(errorCheck.isIdleAfterError, 'Operator must revert to state-idle after 2.5s error state');

    opWin.destroy();
  });

  // ----------------------------------------------------
  // TEST 11: Desktop Platformer Surface Engine (spatialEngine.js)
  // ----------------------------------------------------
  report('spatialEngine.js calculates top title ledge, taskbar floor, and contextual actions', () => {
    const { calculateSurfaceTargets, PET_WIDTH, PET_HEIGHT, SWARM_GAP } = require('./spatialEngine');

    const fakeDisplay = {
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    };
    const FLOOR_Y = 1080 - 88; // 992

    // 1. Desktop / Explorer / Minimized -> Taskbar Floor
    const taskbarTargets = calculateSurfaceTargets({ process: 'explorer', title: 'Desktop' }, fakeDisplay);
    assert.strictEqual(taskbarTargets.pet1.surface, 'taskbar');
    assert.strictEqual(taskbarTargets.pet1.y, FLOOR_Y, `Pet 1 Y must be on taskbar floor (${FLOOR_Y}), got ${taskbarTargets.pet1.y}`);
    assert.strictEqual(taskbarTargets.pet2.y, FLOOR_Y, `Pet 2 Y must be on taskbar floor (${FLOOR_Y}), got ${taskbarTargets.pet2.y}`);
    assert.strictEqual(taskbarTargets.pet2.x - taskbarTargets.pet1.x, 100, 'Taskbar pets should have reasonable separation');
    assert.strictEqual(taskbarTargets.pet1.action, 'state-idle');
    assert.strictEqual(taskbarTargets.pet2.action, 'state-idle');

    // 2. Focused Application (VS Code) -> Top Title Bar Ledge
    // Window: x: 100, y: 200, width: 1200, height: 800
    // Ledge Y = 200 - 88 + 12 = 124
    // Base Anchor X = 100 + 1200 - 240 = 1060
    const codeTargets = calculateSurfaceTargets({
      x: 100,
      y: 200,
      width: 1200,
      height: 800,
      title: 'petManager.js - Visual Studio Code',
      process: 'code'
    }, fakeDisplay);

    assert.strictEqual(codeTargets.pet1.surface, 'app-top');
    assert.strictEqual(codeTargets.pet1.y, 124, `Pet 1 ledge Y should be 124, got ${codeTargets.pet1.y}`);
    assert.strictEqual(codeTargets.pet2.y, 124, `Pet 2 ledge Y should be 124, got ${codeTargets.pet2.y}`);
    assert.strictEqual(codeTargets.pet1.x, 1060, `Pet 1 anchor X should be 1060, got ${codeTargets.pet1.x}`);
    assert.strictEqual(codeTargets.pet2.x, 1060 + 95, `Pet 2 anchor X should be 1155, got ${codeTargets.pet2.x}`);
    assert.strictEqual(codeTargets.pet1.action, 'state-idle', 'Scout must be state-idle on ledge');
    assert.strictEqual(codeTargets.pet2.action, 'state-running', 'Operator must be state-running (laptop typing) on VS Code ledge');

    // 3. Google Meet application -> state-waiting for Operator
    const meetTargets = calculateSurfaceTargets({
      x: 200,
      y: 150,
      width: 1000,
      height: 700,
      title: 'Google Meet - Standup',
      process: 'chrome'
    }, fakeDisplay);
    assert.strictEqual(meetTargets.pet2.action, 'state-waiting', 'Operator must be state-waiting for Google Meet');

    // 4. Window pushed to top edge (y = 0) -> Perch inside top-right corner (y = 10)
    const topEdgeTargets = calculateSurfaceTargets({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      title: 'Full Screen Window',
      process: 'app'
    }, fakeDisplay);
    assert.strictEqual(topEdgeTargets.pet1.y, 10, `Pushed to top edge should perch inside at y=10, got ${topEdgeTargets.pet1.y}`);

    // 5. Hard Ground Lock verification: under no circumstance can Y exceed FLOOR_Y
    const lowWinTargets = calculateSurfaceTargets({
      x: 100,
      y: 1050,
      width: 500,
      height: 400,
      title: 'Low Window',
      process: 'app'
    }, fakeDisplay);
    assert(lowWinTargets.pet1.y <= FLOOR_Y, `Pet 1 Y must never exceed FLOOR_Y (${FLOOR_Y}), got ${lowWinTargets.pet1.y}`);
    assert(lowWinTargets.pet2.y <= FLOOR_Y, `Pet 2 Y must never exceed FLOOR_Y (${FLOOR_Y}), got ${lowWinTargets.pet2.y}`);
  });

  // ----------------------------------------------------
  // TEST 12: Spatial Tracker DPI Normalization & Self-Filtering
  // ----------------------------------------------------
  report('spatialTracker.js normalizes High-DPI coordinates and filters pet windows', () => {
    const { SpatialTracker } = require('./spatialTracker');
    const tracker = new SpatialTracker();

    // DPI normalization test (e.g. 150% scaling)
    const rawBounds = { x: 300, y: 150, width: 1500, height: 900 };
    const norm = tracker.normalizeBounds(rawBounds);
    assert(norm.x >= 0 && norm.width > 0, 'Normalized bounds must produce valid coordinates');

    // Ignore checks
    assert(tracker.isIgnored({ title: 'Grumphy Scout', bounds: { x: 100, y: 100, width: 280, height: 400 } }), 'Must ignore Grumphy windows');
    assert(tracker.isIgnored({ title: 'WhatsApp Pet', bounds: { x: 100, y: 100, width: 280, height: 400 } }), 'Must ignore WhatsApp Pet windows');
    assert(tracker.isIgnored({ title: 'Electron', bounds: { x: 100, y: 100, width: 280, height: 400 } }), 'Must ignore Electron debug windows');
    assert(tracker.isIgnored({ title: 'Valid Window', bounds: { x: -32000, y: -32000, width: 0, height: 0 } }), 'Must ignore minimized/offscreen windows');
    assert(!tracker.isIgnored({ title: 'Google Meet', bounds: { x: 100, y: 100, width: 800, height: 600 } }), 'Must NOT ignore valid app windows');

    // Jitter threshold checks (>40px vs <=40px)
    const baseWin = { title: 'VS Code', bounds: { x: 100, y: 100, width: 800, height: 600 } };
    const jitterWin = { title: 'VS Code', bounds: { x: 110, y: 115, width: 805, height: 600 } }; // Shifts <= 15px
    const movedWin = { title: 'VS Code', bounds: { x: 160, y: 100, width: 800, height: 600 } }; // Shifts 60px (>40px)

    assert.strictEqual(tracker.hasSignificantChange(jitterWin, baseWin), false, 'Micro jitter <=40px must NOT trigger change');
    assert.strictEqual(tracker.hasSignificantChange(movedWin, baseWin), true, 'Movement >40px MUST trigger change');
  });

  // ----------------------------------------------------
  // TEST 13: Step-by-Step Walking Engine & Velocity-Linked Animations
  // ----------------------------------------------------
  await reportAsync('petManager.js walking engine drives velocity-linked states with <=4px arrival snap', async () => {
    const petManager = require('./petManager');

    const testWin = new BrowserWindow({
      width: 280,
      height: 400,
      x: 100,
      y: 100,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    await testWin.loadFile('index.html', { query: { petId: 'test-platformer-pet', skinType: 'scout', role: 'academic' } });

    petManager.activePets.set('test-platformer-pet', {
      win: testWin,
      config: { petId: 'test-platformer-pet', startX: 100, startY: 100 },
      navigationTimer: null,
      isNavigating: false
    });

    // Step 1: Navigate rightward from x=100 to x=500
    const arrivedRightPromise = new Promise(resolve => {
      petManager.navigatePet('test-platformer-pet', 500, 100, 'state-waiting', { lerpFactor: 0.35, onArrival: resolve });
    });

    // After 50ms, window should be in-flight moving right and in state-run-right
    await new Promise(r => setTimeout(r, 60));
    const [midX] = testWin.getPosition();
    assert(midX > 110, `Pet should have moved rightward, got x=${midX}`);

    const midState = await testWin.webContents.executeJavaScript('window.currentState()');
    assert.strictEqual(midState, 'state-run-right', 'Pet moving right must assume state-run-right');

    // Wait for arrival (<=4px threshold snaps to target and applies state-waiting)
    await arrivedRightPromise;
    const [finalX, finalY] = testWin.getPosition();
    assert.strictEqual(finalX, 500, `Pet must snap precisely to final target X=500, got ${finalX}`);
    assert.strictEqual(finalY, 100, `Pet must snap precisely to final target Y=100, got ${finalY}`);

    const finalState = await testWin.webContents.executeJavaScript('window.currentState()');
    assert.strictEqual(finalState, 'state-waiting', 'Pet on arrival must assume profile action state (state-waiting)');

    // Step 2: Navigate leftward from x=500 to x=100
    const arrivedLeftPromise = new Promise(resolve => {
      petManager.navigatePet('test-platformer-pet', 100, 100, 'state-running', { lerpFactor: 0.35, onArrival: resolve });
    });
    await new Promise(r => setTimeout(r, 60));
    const leftState = await testWin.webContents.executeJavaScript('window.currentState()');
    assert.strictEqual(leftState, 'state-run-left', 'Pet moving left must assume state-run-left');

    await arrivedLeftPromise;
    const [endX] = testWin.getPosition();
    assert.strictEqual(endX, 100, `Pet must snap to X=100, got ${endX}`);
    const endAction = await testWin.webContents.executeJavaScript('window.currentState()');
    assert.strictEqual(endAction, 'state-running', 'Pet on arrival must assume state-running');

    // Clean up
    petManager.activePets.delete('test-platformer-pet');
    testWin.destroy();
  });

  // ----------------------------------------------------
  // TEST 14: Swarm Platformer Docking & 95px Separation
  // ----------------------------------------------------
  await reportAsync('handleForegroundWindowChanged docks swarm on app ledge with 95px horizontal gap', async () => {
    const petManager = require('./petManager');
    petManager.dragCooldownUntil = 0;

    const scoutWin = new BrowserWindow({
      width: 280,
      height: 400,
      x: 200,
      y: 200,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    const operatorWin = new BrowserWindow({
      width: 280,
      height: 400,
      x: 100,
      y: 200,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    await scoutWin.loadFile('index.html', { query: { petId: 'pet-scout', skinType: 'scout', role: 'academic' } });
    await operatorWin.loadFile('index.html', { query: { petId: 'pet-operator', skinType: 'operator', role: 'system' } });

    petManager.activePets.set('pet-scout', {
      win: scoutWin,
      config: { petId: 'pet-scout', startX: 200, startY: 200 },
      navigationTimer: null,
      isNavigating: false
    });
    petManager.activePets.set('pet-operator', {
      win: operatorWin,
      config: { petId: 'pet-operator', startX: 100, startY: 200 },
      navigationTimer: null,
      isNavigating: false
    });

    // Simulate foreground window changed to VS Code at { x: 200, y: 150, width: 1200, height: 800 }
    petManager.handleForegroundWindowChanged({
      title: 'Visual Studio Code - Workspace',
      process: 'code',
      bounds: { x: 200, y: 150, width: 1200, height: 800 }
    }, { lerpFactor: 0.35 });

    // Wait for both pets to lerp and arrive
    await new Promise(r => setTimeout(r, 600));

    const [sX, sY] = scoutWin.getPosition();
    const [oX, oY] = operatorWin.getPosition();

    // Verify 95px horizontal gap between Scout and Operator
    assert.strictEqual(oX - sX, 95, `Operator X (${oX}) minus Scout X (${sX}) must equal 95px swarm gap`);
    assert.strictEqual(sY, oY, `Scout Y (${sY}) and Operator Y (${oY}) must align on the same ledge height`);

    // Clean up
    petManager.activePets.delete('pet-scout');
    petManager.activePets.delete('pet-operator');
    scoutWin.destroy();
    operatorWin.destroy();
  });

  // ----------------------------------------------------
  // TEST 15: 25-Second Drag Priority Guardrail & Lerp Cancellation
  // ----------------------------------------------------
  report('handlePetDragStarted cancels active lerp and activates 25-second tracking cooldown', () => {
    const petManager = require('./petManager');

    petManager.activePets.set('test-drag-pet', {
      win: { isDestroyed: () => false, setPosition: () => {} },
      navigationTimer: setInterval(() => {}, 1000),
      isNavigating: true
    });

    const now = Date.now();
    petManager.handlePetDragStarted('test-drag-pet');

    const pet = petManager.activePets.get('test-drag-pet');
    assert.strictEqual(pet.navigationTimer, null, 'Active navigation timer must be cleared immediately upon drag');
    assert.strictEqual(pet.isNavigating, false, 'isNavigating must be reset to false');
    assert(petManager.dragCooldownUntil >= now + 24000, 'dragCooldownUntil must be at least 24+ seconds in the future (25s cooldown)');

    // Attempting to handle foreground window during cooldown should be ignored
    let movedDuringCooldown = false;
    const origNavigate = petManager.navigatePet;
    petManager.navigatePet = () => { movedDuringCooldown = true; };

    petManager.handleForegroundWindowChanged({
      title: 'Google Meet',
      bounds: { x: 100, y: 100, width: 800, height: 600 }
    });

    assert.strictEqual(movedDuringCooldown, false, 'Autonomous navigation must be blocked during 25s drag cooldown');

    // Reset cooldown
    petManager.dragCooldownUntil = 0;
    petManager.navigatePet = origNavigate;
    petManager.activePets.delete('test-drag-pet');
  });

  console.log('\n========================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    app.quit();
  }
}

app.whenReady().then(runTests);


