# Grumphy 🐾

An all-in-one AI desktop pet that monitors your WhatsApp (and eventually Telegram and other platforms) for important academic alerts, deadlines, and notifications! Grumphy sits cheerfully on your desktop, reads your messages in the background using Gemini AI, and speaks to you out loud when important deadlines are detected.

## ✨ Features
- **Floating Desktop Pet:** A cute, frameless, transparent widget built with Electron.js and pure CSS fluid animations (glassmorphism UI).
- **Background Scraper:** Seamlessly hooks into WhatsApp Web using `whatsapp-web.js` to monitor designated group chats.
- **AI Brain:** Powered by Gemini 3.1 Flash-Lite to accurately classify messages, extract deadlines, and detect urgency.
- **Multimodal Voice:** Talk to Grumphy using your microphone! Grumphy listens to your voice via native MediaRecorder, streams the audio to Gemini, and replies natively via Web Speech API.
- **Text-to-Speech (TTS):** Grumphy reads out notifications using natural Windows voices and synchronizes its mouth animations with the spoken audio!

## 🚀 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/cryoxyl-beep/Grumphy.git
   cd Grumphy
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   # Your Google Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key_here

   # Comma-separated list of WhatsApp group names to monitor
   TARGET_GROUPS="Math Class 2026, Physics Lab, Project Group"

   # Logging level
   LOG_LEVEL=info
   ```

4. **Run the App:**
   ```bash
   npm run electron
   ```
   *Note: On your first run, a WhatsApp QR code will appear in the terminal. Scan it with your phone to authenticate.*

## 🎤 Talking to Grumphy
- **Hotkey:** Press `Ctrl + Shift + Space` anywhere on your computer to wake Grumphy up.
- **Click:** Alternatively, click directly on Grumphy's body.
- Say something like: *"Hey Grumphy, do I have any physics assignments due soon?"*
- Grumphy will record your audio, pass it to Gemini, and speak the answer out loud!

## 🛠 Tech Stack
- **Electron.js** (Transparent UI & Global Shortcuts)
- **Node.js** (Background orchestrator)
- **WhatsApp-Web.js** (Headless Puppeteer injection)
- **Google GenAI SDK** (Gemini 3.1 Flash-Lite for RAG and Multimodal Audio)
- **HTML/CSS/JS** (Vanilla frontend with Keyframe animations)

## 🤝 Future Roadmap
- [ ] Integration with Telegram and Discord.
- [ ] Customizable pet themes and skins.
- [ ] Calendar integration (Google Calendar/Notion).

---
*Built with ❤️ and AI.*
