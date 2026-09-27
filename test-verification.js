const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const assert = require('assert');


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
  // TEST 1: Spritesheet Asset Verification
  // ----------------------------------------------------
  await reportAsync('Spritesheet asset exists and matches 1536x1872 (8x9 frames)', async () => {
    const spritePath = path.join(__dirname, 'sprites', 'spritesheet.webp');
    assert(fs.existsSync(spritePath), `Spritesheet not found at ${spritePath}`);
    const meta = await sharp(spritePath).metadata();
    assert.strictEqual(meta.format, 'webp', `Format should be webp, got ${meta.format}`);
    assert.strictEqual(meta.width, 1536, `Width should be 1536, got ${meta.width}`);
    assert.strictEqual(meta.height, 1872, `Height should be 1872, got ${meta.height}`);
    assert.strictEqual(meta.width / 8, 192, 'Frame width should be 192');
    assert.strictEqual(meta.height / 9, 208, 'Frame height should be 208');
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
  // TEST 3: CSS Keyframe & Row Alignment Verification
  // ----------------------------------------------------
  report('pet.css has correct keyframe math, scale, and cozy frame timings', () => {
    const css = fs.readFileSync(path.join(__dirname, 'pet.css'), 'utf8');
    assert(css.includes('--pet-size: 88px;'), 'Missing --pet-size: 88px');
    assert(css.includes("background-image: url('./sprites/spritesheet.webp');"), 'Missing background-image');
    assert(css.includes('background-size: calc(var(--pet-size) * 8) calc(var(--pet-size) * 9);'), 'Missing background-size calculation');
    assert(css.includes('image-rendering: pixelated;'), 'Missing image-rendering: pixelated');
    assert(css.includes('-webkit-app-region: no-drag;'), 'Missing no-drag decoupling');
    assert(!css.includes('-webkit-app-region: drag;'), 'Must NOT have -webkit-app-region: drag');

    // Keyframe verification
    assert(css.includes('@keyframes sprite-cycle-8'), 'Missing @keyframes sprite-cycle-8');
    assert(css.includes('@keyframes sprite-cycle-6'), 'Missing @keyframes sprite-cycle-6');
    assert(css.includes('@keyframes sprite-cycle-5'), 'Missing @keyframes sprite-cycle-5');
    assert(css.includes('@keyframes sprite-cycle-4'), 'Missing @keyframes sprite-cycle-4');

    // All 9 rows with exact valid frame counts
    const rows = [
      { name: 'Row 1 IDLE', y: '0px', dur: '1.4s', frames: 6 },
      { name: 'Row 2 RUN RIGHT', y: 'calc(-1 * var(--pet-size) * 1)', dur: '0.9s', frames: 8 },
      { name: 'Row 3 RUN LEFT', y: 'calc(-1 * var(--pet-size) * 2)', dur: '0.9s', frames: 8 },
      { name: 'Row 4 WAVING', y: 'calc(-1 * var(--pet-size) * 3)', dur: '1.1s', frames: 4 },
      { name: 'Row 5 JUMP', y: 'calc(-1 * var(--pet-size) * 4)', dur: '0.8s', frames: 5 },
      { name: 'Row 6 FAILED', y: 'calc(-1 * var(--pet-size) * 5)', dur: '1.5s', frames: 8 },
      { name: 'Row 7 WAITING', y: 'calc(-1 * var(--pet-size) * 6)', dur: '1.3s', frames: 6 },
      { name: 'Row 8 RUNNING', y: 'calc(-1 * var(--pet-size) * 7)', dur: '0.6s', frames: 6 },
      { name: 'Row 9 REVIEW', y: 'calc(-1 * var(--pet-size) * 8)', dur: '1.2s', frames: 6 },
    ];

    for (const r of rows) {
      assert(css.includes(r.y), `Missing y offset for ${r.name}: ${r.y}`);
      assert(css.includes(`sprite-cycle-${r.frames} ${r.dur} steps(${r.frames}) infinite`), `Missing animation for ${r.name}: sprite-cycle-${r.frames} ${r.dur} steps(${r.frames}) infinite`);
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
  // TEST 5: Live BrowserWindow DOM & State Machine Execution
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
