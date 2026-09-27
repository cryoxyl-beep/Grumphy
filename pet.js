const petContainer = document.getElementById('petContainer');
const speechBubble = document.getElementById('speechBubble');
const sbCategory = document.getElementById('sbCategory');
const sbSummary = document.getElementById('sbSummary');
const sbDeadline = document.getElementById('sbDeadline');

let bubbleTimeout = null;

function showSpeechBubble(category, summary, deadline) {
  sbCategory.textContent = category;
  sbSummary.textContent = summary;
  
  if (deadline) {
    sbDeadline.textContent = deadline;
    sbDeadline.style.display = 'inline-block';
  } else {
    sbDeadline.style.display = 'none';
  }

  speechBubble.classList.remove('hidden');
  speechBubble.classList.add('visible');

  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
  }

  // Auto-hide after 8 seconds
  bubbleTimeout = setTimeout(() => {
    hideSpeechBubble();
  }, 8000);
}

function hideSpeechBubble() {
  speechBubble.classList.remove('visible');
  speechBubble.classList.add('hidden');
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
}

// Allow clicking the bubble to dismiss it early
speechBubble.addEventListener('click', () => {
  hideSpeechBubble();
});

function setPetState(state) {
  // Remove existing state classes
  petContainer.classList.remove('idle', 'alert', 'listening', 'speaking');
  // Add new state class
  petContainer.classList.add(state);
}

// Initialize with idle state
setPetState('idle');

// ----- Real-time Backend Integration -----
const { ipcRenderer } = require('electron');

let isMuted = false;

// Listen for Mute toggle from Context Menu
ipcRenderer.on('toggle-mute', (event, muted) => {
  isMuted = muted;
  if (isMuted) {
    window.speechSynthesis.cancel();
    setPetState('idle');
  }
});

// Text-to-Speech Engine
function speakText(textToSpeak, onEndCallback) {
  if (isMuted) {
    if (onEndCallback) onEndCallback();
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(textToSpeak);

  // Pick a natural voice (prefer Zira/Jenny/David on Windows)
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('David')) || voices[0];
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  
  utterance.pitch = 1.1; // Friendly Mascot pitch
  utterance.rate = 1.05;

  // Sync animations
  utterance.onstart = () => {
    setPetState('speaking');
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

function showSpeechBubbleText(text, keepOpen = false) {
  sbCategory.textContent = '';
  sbSummary.textContent = text;
  sbDeadline.style.display = 'none';

  speechBubble.classList.remove('hidden');
  speechBubble.classList.add('visible');

  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }

  if (!keepOpen) {
    bubbleTimeout = setTimeout(() => {
      hideSpeechBubble();
    }, 8000);
  }
}

function startListening() {
  window.speechSynthesis.cancel();
  setPetState('listening');
  showSpeechBubbleText("Listening... 🎤", true);
  
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
          showSpeechBubbleText("Thinking... ✨", true);
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
              const base64Audio = reader.result.split(',')[1];
              
              ipcRenderer.invoke('ask-pet-audio', base64Audio).then((answer) => {
                  showSpeechBubbleText(answer, true);
                  speakText(answer, () => {
                      hideSpeechBubble();
                  });
              }).catch(err => {
                  showSpeechBubbleText("Oops, something went wrong.");
                  setPetState('idle');
              });
          };

          // Release the microphone
          stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      
      // Stop recording automatically after 4 seconds
      setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
          }
      }, 4000);

  }).catch(err => {
      console.error(err);
      showSpeechBubbleText("Microphone access denied.");
      setTimeout(() => {
          setPetState('idle');
          hideSpeechBubble();
      }, 2000);
  });
}

ipcRenderer.on('trigger-listen', () => {
  startListening();
});

const blobEl = document.querySelector('.blob');
blobEl.addEventListener('click', (e) => {
  if (e.button === 0) {
    startListening();
  }
});

// Listen for actual Academic Alerts from the WhatsApp backend
ipcRenderer.on('academic-alert', (event, data) => {
  const { category, summary, deadline, groupName } = data;
  
  // 1. Instantly pop to Alert state
  setPetState('alert');
  
  // 2. Show the visual bubble
  showSpeechBubble(category, summary, deadline);
  
  // 3. Announce it out loud (wait half a second for dramatic effect)
  setTimeout(() => {
    speakAlert(data);
  }, 500);
});

// Ensure voices load on Windows
window.speechSynthesis.onvoiceschanged = () => {
  window.speechSynthesis.getVoices();
};
