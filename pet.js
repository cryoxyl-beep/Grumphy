const { ipcRenderer } = require('electron');

const petSprite = document.getElementById('pet-sprite') || document.getElementById('pet-character');
const petCharacter = petSprite; // Backwards compatibility
const petContainer = petSprite; // Backwards compatibility
const speechBubble = document.getElementById('speechBubble') || document.getElementById('speech-bubble');
const sbCategory = document.getElementById('sbCategory');
const sbSummary = document.getElementById('sbSummary');
const sbDeadline = document.getElementById('sbDeadline');

let bubbleTimeout = null;
let isMuted = false;
let isThinking = false;

// ----------------------------------------------------
// State Management & Sprite Mapping
// ----------------------------------------------------
const STATE_MAP = {
  idle: 'state-idle',
  'state-idle': 'state-idle',
  runRight: 'state-run-right',
  'run-right': 'state-run-right',
  'state-run-right': 'state-run-right',
  'state-runRight': 'state-run-right',
  runLeft: 'state-run-left',
  'run-left': 'state-run-left',
  'state-run-left': 'state-run-left',
  'state-runLeft': 'state-run-left',
  waving: 'state-waving',
  'state-waving': 'state-waving',
  jump: 'state-jumping',
  jumping: 'state-jumping',
  'state-jump': 'state-jumping',
  'state-jumping': 'state-jumping',
  alert: 'state-jumping',
  'state-alert': 'state-jumping',
  failed: 'state-failed',
  'state-failed': 'state-failed',
  waiting: 'state-waiting',
  'state-waiting': 'state-waiting',
  listening: 'state-waiting',
  'state-listening': 'state-waiting',
  running: 'state-running',
  'state-running': 'state-running',
  review: 'state-review',
  'state-review': 'state-review',
  speaking: 'state-review',
  'state-speaking': 'state-review'
};

const ALL_STATE_CLASSES = [
  'state-idle',
  'state-run-right',
  'state-runRight',
  'state-run-left',
  'state-runLeft',
  'state-waving',
  'state-jump',
  'state-jumping',
  'state-failed',
  'state-waiting',
  'state-running',
  'state-review'
];

let currentState = 'state-idle';

function isState(name) {
  const target = STATE_MAP[name] || (name.startsWith('state-') ? name : `state-${name}`);
  return currentState === target;
}

function setPetState(state) {
  const cleanState = (state || '').replace(/^\./, '');
  const targetClass = STATE_MAP[cleanState] || (cleanState.startsWith('state-') ? cleanState : `state-${cleanState}`);
  if (currentState === targetClass) return;
  const el = document.getElementById('pet-sprite') || document.getElementById('pet-character');
  if (el) {
    ALL_STATE_CLASSES.forEach(cls => el.classList.remove(cls));
    el.classList.add(targetClass);
    currentState = targetClass;
  }
}

// Initial state
setPetState('state-idle');

// ----------------------------------------------------
// Window Click-Through & Hitbox Management
// ----------------------------------------------------
let isHoveringSprite = false;
let isHoveringSpeechBubble = false;
let isMouseDown = false;
let isDragging = false;
let wasDragging = false;

function shouldIgnoreMouseEvents() {
  if (isMouseDown || isDragging) return false;
  if (isHoveringSprite) return false;
  if (isHoveringSpeechBubble && speechBubble && speechBubble.classList.contains('visible') && !speechBubble.classList.contains('hidden')) {
    return false;
  }
  return true;
}

function updateMouseIgnoreState() {
  if (shouldIgnoreMouseEvents()) {
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  } else {
    ipcRenderer.send('set-ignore-mouse-events', false);
  }
}

// By default, ignore mouse events on the transparent window, but forward movements so hover works
updateMouseIgnoreState();

const attachedHitboxes = new WeakSet();
const attachHitbox = (el) => {
  if (!el || attachedHitboxes.has(el)) return;
  attachedHitboxes.add(el);

  el.addEventListener('mouseenter', () => {
    if (el === speechBubble) {
      isHoveringSpeechBubble = true;
      if (!speechBubble.classList.contains('visible') || speechBubble.classList.contains('hidden')) {
        return;
      }
    } else if (el === petSprite) {
      isHoveringSprite = true;
      if (isState('idle') && !isDragging && !isMouseDown) {
        setPetState('state-waving');
      }
    }
    updateMouseIgnoreState();
  });

  el.addEventListener('mouseleave', () => {
    if (el === speechBubble) {
      isHoveringSpeechBubble = false;
    } else if (el === petSprite) {
      isHoveringSprite = false;
      if (isState('waving') && !isDragging && !isMouseDown) {
        setPetState('state-idle');
      }
    }
    updateMouseIgnoreState();
  });
};

attachHitbox(document.getElementById('pet-sprite'));
attachHitbox(document.getElementById('speechBubble') || document.getElementById('speech-bubble'));

// ----------------------------------------------------
// Speech Bubble Engine
// ----------------------------------------------------
function showSpeechBubble(category, summary, deadline) {
  if (sbCategory) sbCategory.textContent = category;
  if (sbSummary) sbSummary.textContent = summary;
  if (sbDeadline) {
    if (deadline) {
      sbDeadline.textContent = deadline;
      sbDeadline.style.display = 'inline-block';
    } else {
      sbDeadline.style.display = 'none';
    }
  }
  if (speechBubble) {
    speechBubble.classList.remove('hidden');
    speechBubble.classList.add('visible');
    attachHitbox(speechBubble);
  }

  if (bubbleTimeout) clearTimeout(bubbleTimeout);
  bubbleTimeout = setTimeout(() => hideSpeechBubble(), 8000);
}

function showSpeechBubbleText(text, keepOpen = false) {
  if (sbCategory) sbCategory.textContent = '';
  if (sbSummary) sbSummary.textContent = text;
  if (sbDeadline) sbDeadline.style.display = 'none';
  if (speechBubble) {
    speechBubble.classList.remove('hidden');
    speechBubble.classList.add('visible');
    attachHitbox(speechBubble);
  }

  if (bubbleTimeout) clearTimeout(bubbleTimeout);
  if (!keepOpen) {
    bubbleTimeout = setTimeout(() => hideSpeechBubble(), 8000);
  }
}

function hideSpeechBubble() {
  if (speechBubble) {
    speechBubble.classList.remove('visible');
    speechBubble.classList.add('hidden');
  }
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  isHoveringSpeechBubble = false;
  // Ensure it immediately stops capturing mouse clicks when transitioning to hidden
  updateMouseIgnoreState();
}

if (speechBubble) {
  speechBubble.addEventListener('click', () => {
    hideSpeechBubble();
  });
}

// ----------------------------------------------------
// Decoupled Mouse Interaction: Drag, Hover, Click, DblClick
// ----------------------------------------------------
let startScreenX = 0;
let startScreenY = 0;
let lastScreenX = 0;
let lastScreenY = 0;
let clickTimeout = null;
let runningTimeout = null;

if (petSprite) {
  petSprite.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left-click initiates drag
    isMouseDown = true;
    isDragging = false;
    wasDragging = false;
    startScreenX = e.screenX;
    startScreenY = e.screenY;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    if (runningTimeout) {
      clearTimeout(runningTimeout);
      runningTimeout = null;
    }
    updateMouseIgnoreState();
  });

  petSprite.addEventListener('click', (e) => {
    if (isDragging || wasDragging) return;

    if (e.detail === 1) {
      clickTimeout = setTimeout(() => {
        startListening();
      }, 250);
    }
  });

  petSprite.addEventListener('dblclick', (e) => {
    if (isDragging || wasDragging) return;

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    if (runningTimeout) {
      clearTimeout(runningTimeout);
      runningTimeout = null;
    }
    setPetState('state-running');
    runningTimeout = setTimeout(() => {
      if (isState('running')) {
        setPetState('state-idle');
      }
      runningTimeout = null;
    }, 2000); // 2 seconds
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isMouseDown) return;

  // Handle release outside window or lost buttons
  if (e.buttons === 0) {
    isMouseDown = false;
    if (isDragging) {
      wasDragging = true;
      isDragging = false;
      setPetState('state-idle');
      setTimeout(() => { wasDragging = false; }, 50);
    }
    updateMouseIgnoreState();
    return;
  }

  const dx = e.screenX - lastScreenX;
  const dy = e.screenY - lastScreenY;
  const totalDist = Math.hypot(e.screenX - startScreenX, e.screenY - startScreenY);

  if (!isDragging && totalDist > 2) {
    isDragging = true;
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    if (runningTimeout) {
      clearTimeout(runningTimeout);
      runningTimeout = null;
    }
  }

  if (isDragging) {
    if (dx > 2) {
      setPetState('state-run-right');
    } else if (dx < -2) {
      setPetState('state-run-left');
    } else if (currentState !== 'state-run-right' && currentState !== 'state-run-left') {
      setPetState(dx >= 0 ? 'state-run-right' : 'state-run-left');
    }

    if (dx !== 0 || dy !== 0) {
      ipcRenderer.send('move-pet-window', { dx, dy });
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
    }
  }
});

window.addEventListener('mouseup', () => {
  if (isMouseDown) {
    isMouseDown = false;
    if (isDragging) {
      wasDragging = true;
      isDragging = false;
      setPetState('state-idle');
      setTimeout(() => { wasDragging = false; }, 50);
    }
    updateMouseIgnoreState();
  }
});

window.addEventListener('blur', () => {
  if (isMouseDown || isDragging) {
    isMouseDown = false;
    if (isDragging) {
      wasDragging = true;
      isDragging = false;
      setPetState('state-idle');
      setTimeout(() => { wasDragging = false; }, 50);
    }
    updateMouseIgnoreState();
  }
});

// ----------------------------------------------------
// Text-to-Speech Engine
// ----------------------------------------------------
function speakText(textToSpeak, onEndCallback) {
  if (isMuted) {
    if (onEndCallback) onEndCallback();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('David')) || voices[0];
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.pitch = 1.1;
  utterance.rate = 1.05;

  utterance.onstart = () => {
    setPetState('review');
  };

  utterance.onend = () => {
    setPetState('idle');
    if (onEndCallback) onEndCallback();
  };

  utterance.onerror = () => {
    setPetState('idle');
    if (onEndCallback) onEndCallback();
  };

  window.speechSynthesis.speak(utterance);
}

function speakAlert({ category, summary, deadline }) {
  const textToSpeak = `Heads up! There's a new assignment for ${category}. ${summary}. Due date is ${deadline || 'not specified'}.`;
  speakText(textToSpeak);
}

// ----------------------------------------------------
// Push-to-Talk Voice Workflow
// ----------------------------------------------------
let isRecording = false;
let cooldownActive = false;

function startListening() {
  if (isThinking || isRecording || cooldownActive) return;

  window.speechSynthesis.cancel();
  isRecording = true;
  setPetState('waiting');
  showSpeechBubbleText("Listening...", true);

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      isRecording = false;

      // Release microphone
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      if (audioBlob.size === 0 || audioChunks.length === 0) {
        showSpeechBubbleText("No speech detected.");
        setPetState('failed');
        setTimeout(() => {
          setPetState('idle');
          hideSpeechBubble();
        }, 2500);
        startCooldown();
        return;
      }

      isThinking = true;
      setPetState('review');
      showSpeechBubbleText("Thinking...", true);

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        if (!base64Audio) {
          showSpeechBubbleText("No speech detected.");
          setPetState('failed');
          setTimeout(() => {
            setPetState('idle');
            hideSpeechBubble();
          }, 2500);
          isThinking = false;
          startCooldown();
          return;
        }

        ipcRenderer.invoke('ask-pet-audio', base64Audio).then((answer) => {
          if (!answer || answer.includes("didn't hear anything") || answer.includes("trouble processing")) {
            showSpeechBubbleText(answer || "No speech detected.");
            setPetState('failed');
            setTimeout(() => {
              setPetState('idle');
              hideSpeechBubble();
            }, 2500);
            isThinking = false;
            startCooldown();
            return;
          }

          showSpeechBubbleText(answer, true);
          setPetState('review');
          speakText(answer, () => {
            hideSpeechBubble();
            setPetState('idle');
            isThinking = false;
            startCooldown();
          });
        }).catch(err => {
          console.error("Voice processing error:", err);
          showSpeechBubbleText("Oops, something went wrong.");
          setPetState('failed');
          setTimeout(() => {
            setPetState('idle');
            hideSpeechBubble();
          }, 2500);
          isThinking = false;
          startCooldown();
        });
      };
    };

    mediaRecorder.start();

    // Stop recording automatically after 3.5 seconds
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 3500);

  }).catch(err => {
    console.error("Microphone error:", err);
    showSpeechBubbleText("Microphone access denied.");
    setPetState('failed');
    setTimeout(() => {
      setPetState('idle');
      hideSpeechBubble();
    }, 2500);
    isRecording = false;
  });
}

function startCooldown() {
  cooldownActive = true;
  setTimeout(() => {
    cooldownActive = false;
  }, 5000);
}

ipcRenderer.on('trigger-listen', () => {
  startListening();
});

// Listen for actual Academic Alerts from the WhatsApp backend
ipcRenderer.on('academic-alert', (event, data) => {
  const { category, summary, deadline } = data;
  setPetState('jumping');
  showSpeechBubble(category, summary, deadline);
  setTimeout(() => {
    speakAlert(data);
  }, 500);
});

ipcRenderer.on('toggle-mute', (event, muted) => {
  isMuted = muted;
  if (isMuted) {
    window.speechSynthesis.cancel();
    setPetState('idle');
  }
});

window.speechSynthesis.onvoiceschanged = () => {
  window.speechSynthesis.getVoices();
};
