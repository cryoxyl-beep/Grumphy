<div align="center">

# 🐾 Grumphy Swarm

### *Intelligent Multi-Pet Desktop Swarm with Local-First AI, Visual Grounding & Academic Monitoring*

[![Platform](https://img.shields.io/badge/Platform-Windows%2011-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-44.4.5-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Ollama](https://img.shields.io/badge/Local%20AI-Qwen2.5%203B-FF6F61?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.ai/)
[![Gemini](https://img.shields.io/badge/Vision%20AI-Gemini%202.5%20Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Neural TTS](https://img.shields.io/badge/TTS-Edge--TTS%20Neural-00A4EF?style=for-the-badge&logo=microsoft&logoColor=white)](https://github.com/rany2/edge-tts)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)

<br/>

> **Grumphy Swarm** is an autonomous desktop companion engine for Windows. Floating transparently above your work, two animated pixel-art pets—**Scout** and **Operator**—act as your real-time academic watchdog and local OS automation agent.

<br/>

```
     Scout (Academic Sentinel)         Operator (OS Automation)
          /\_/\                               /\_/\   
         ( o.o )  "Physics Due 11:59PM!"     ( -.- )  "Opening Chrome & Searching..."
          > ^ <                               > ^ <   
```

---

</div>

## 🌟 Key Highlights

- 🤖 **Local-First AI Execution**: Operator runs primarily on your local GPU via **Ollama (`qwen2.5:3b`)**, providing fast, zero-latency OS control with zero cloud token usage. Auto-falls back to **Gemini 3.1 Flash-Lite** if Ollama is unreachable.
- 👁️ **Visual Grounding Engine**: Gives the text-only local model vision. Uses **Gemini 2.5 Flash Vision** to locate UI elements on display screens via normalized `box_2d` coordinates, converting them to physical screen pixels for autonomous clicking and typing.
- 🛠️ **Full Windows OS Automation**: Autonomous execution of app launching, URL browsing, clipboard typing, hotkey pressing, process management (`taskkill`), screen capturing, and quick desktop note management.
- 📱 **Real-Time WhatsApp Sentinel**: **Scout** monitors WhatsApp academic group chats 24/7 via `whatsapp-web.js`, using Gemini AI to extract deadlines, calculate urgency, and notify you in real-time.
- 🗣️ **Expressive Neural Text-to-Speech**: High-fidelity, natural human-like voice synthesis using `edge-tts` (featuring Jenny, Aria, and Sonia Neural voices).
- 🪟 **Click Pass-Through Canvas**: Floating transparent windows with dynamic `setIgnoreMouseEvents` pass-through—enjoy desktop pets without blocking Chrome, VS Code, or gaming windows.

---

## 👥 Meet the Companions

| Companion | Role | Primary Function | Primary Brain | Voice Profile | Hotkey |
|:---:|:---:|:---|:---:|:---:|:---:|
| **Scout** 🐶 | **Academic Watchdog** | Monitors WhatsApp groups for assignments, circulars, and viva notices | Gemini 3.1 Flash-Lite | `en-US-JennyNeural` (Warm) | `Ctrl + Shift + Space` |
| **Operator** 💻 | **OS Automation Agent** | Executes OS commands, launches apps, types text, and visually clicks UI elements | Ollama `qwen2.5:3b` *(Gemini Fallback)* | `en-US-AriaNeural` (Smooth) | `Ctrl + Alt + Space` |

---

## 🎭 Spritesheet Action Matrix

Both pets feature custom WebP sprite sheets (`./sprites/spritesheet.webp` and `./sprites/pet2-spritesheet.webp`) with frame-perfect CSS quantization:

| Row | Action State | Visual Behavior | Trigger / Event | Timing |
|:---:|:---|:---|:---|:---:|
| **1** | **IDLE** | Calm breathing / blinking | Resting state on desktop | `1.4s infinite` |
| **2** | **RUN RIGHT** | Stepping right | Dragging / moving rightward | `0.9s infinite` |
| **3** | **RUN LEFT** | Stepping left | Dragging / moving leftward | `0.9s infinite` |
| **4** | **WAVING** | Friendly wave | Mouse hover over mascot | `1.1s infinite` |
| **5** | **JUMP** | Alert bounce | Academic alert received | `0.8s infinite` |
| **6** | **FAILED** | Sweatdrop / dizzy error | Execution failure or microphone error | `1.5s infinite` |
| **7** | **WAITING** | Listening / attentive look | Microphone active / listening | `1.3s infinite` |
| **8** | **RUNNING (WORK)** | Typing on laptop | Autonomous tool execution in progress | `0.6s infinite` |
| **9** | **REVIEW (HAPPY)** | Confirmed / speaking | Task complete / reading summary out loud | `1.2s infinite` |

---

## 🛠️ System Automation Tools

Operator autonomously invokes these tools during its multi-step execution loop:

| Tool | Signature | Functionality |
|:---|:---|:---|
| **`open_url`** | `{ url, browser? }` | Opens any HTTP/HTTPS link in default browser or specific browser (`chrome`, `edge`). |
| **`launch_application`** | `{ appName }` | Launches Windows executables (`notepad`, `calc`, `code`, `spotify`, etc.). |
| **`close_application`** | `{ processName }` | Safely terminates process via `taskkill` after user confirmation bubble. |
| **`type_text`** | `{ text }` | Types text into active input using Electron clipboard restoration + `Ctrl+V`. |
| **`press_key`** | `{ key }` | Triggers key presses (`Enter`, `Tab`, `Escape`, `ctrl+a`, `ctrl+l`, arrows). |
| **`click_coordinate`** | `{ x, y }` | DPI-aware physical mouse click via `user32.dll` (`SetProcessDPIAware` + `mouse_event`). |
| **`look_at_screen_and_find`** | `{ targetDescription }` | Captures screen, queries Gemini Vision for 2D bounding box, converts to physical `(x,y)`. |
| **`take_screenshot`** | `{ destinationPath }` | Captures primary display frame and saves PNG/JPEG file. |
| **`getSystemDiagnostics`** | `{}` | Returns real-time RAM usage, CPU load, and system uptime. |

---

## 🏗️ Architecture & Agent Flow

```mermaid
flowchart TD
    subgraph User Input
        User[User Voice / Hotkey Command] -->|Ctrl+Alt+Space| Renderer[pet.js Renderer]
    end

    subgraph Agent Controller & Fallback
        Renderer -->|IPC: execute-agent-task| AI[aiAnalyzer.js]
        AI -->|POST http://localhost:11434| Ollama{Ollama Local GPU<br/>qwen2.5:3b}
        Ollama -- Timeout / ECONNREFUSED --> GeminiFallback[Gemini 3.1 Flash-Lite]
    end

    subgraph Visual Grounding & Tools
        Ollama -->|Tool Call: look_at_screen_and_find| Vision[Gemini 2.5 Flash Vision]
        Vision -->|Return box_2d [ymin,xmin,ymax,xmax]| MapCoords[Physical Pixel Converter]
        MapCoords -->|Normalized X,Y| ClickTool[click_coordinate Tool]
        Ollama -->|Tool Call: open_url / launch_application| SysTools[systemTools.js Execution Engine]
    end

    subgraph OS Layer
        SysTools -->|DPI-Aware Windows Win32| Desktop[Windows 11 OS]
        SysTools -->|Edge-TTS Service| Audio[Spoken Neural Feedback]
    end
```

---

## 🚀 Quick Start

### Prerequisites

- **Windows 10 / 11**
- **Node.js 18+** or **Node.js 20+**
- **Ollama** installed with model loaded:
  ```bash
  ollama pull qwen2.5:3b
  ```
- A free **Google Gemini API Key** ([Get one at Google AI Studio](https://aistudio.google.com/))

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/cryoxyl-beep/Grumphy.git
   cd Grumphy
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment (`.env`):**
   Create a `.env` file in the project root:
   ```env
   # Google Gemini API Key (For Vision Grounding & Cloud Fallback)
   GEMINI_API_KEY=your_gemini_api_key_here

   # Ollama Model Name (Default: qwen2.5:3b)
   OLLAMA_MODEL=qwen2.5:3b

   # WhatsApp Target Groups to Monitor
   TARGET_GROUPS="CSE-A - 2026-30, Academic Circulars"

   # Logging Level (debug, info, warn, error)
   LOG_LEVEL=debug
   ```

4. **Launch the Swarm:**
   ```bash
   npm run electron
   ```

> 📱 **WhatsApp Authentication**: On initial startup, scan the terminal QR code with your phone. Authentication data is saved locally in `./.wwebjs_auth/`.

---

## 📝 Logging & Diagnostics

Operator writes log telemetry to `logs/operator-YYYY-MM-DD.log` and the terminal.
- Adjust verbosity using `LOG_LEVEL=debug` or `LOG_LEVEL=info` in `.env`.
- Automatically logs LLM step iterations, tool execution times, DPI conversions, and fallback triggers.

---

## 🧪 Testing

Run the automated regression test suite:

```bash
# Run headless verification suite
npm test

# Run agent flow & tool execution suite
node test-agent-flow.js
```

---

## 📄 License

This project is licensed under the **ISC License**.

<div align="center">

Crafted with ❤️ using Electron, Ollama, Gemini AI, and Edge-TTS.

</div>
