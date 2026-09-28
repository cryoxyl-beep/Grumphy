# Grumphy

Grumphy is a Windows desktop companion built with Electron. It runs two animated, transparent desktop pets: **Scout**, which monitors selected WhatsApp groups for academic updates, and **Operator**, which can carry out approved desktop tasks through a local-first AI agent.

The project combines WhatsApp monitoring, Gemini-powered message analysis and vision, optional local Ollama inference, speech synthesis, and Windows automation in a single desktop experience.

## Features

- Two always-on-top pixel-art companions with click-through transparent windows.
- WhatsApp group monitoring with AI extraction of assignments, exams, submissions, and notices.
- Desktop notifications and an in-app alert flow for relevant academic messages.
- Voice and text interaction through global shortcuts.
- Local-first Operator agent using Ollama, with Gemini fallback and Gemini-based visual grounding.
- Windows tools for opening URLs and apps, typing, approved key presses, screenshots, diagnostics, and quick notes.
- Natural speech output through Microsoft Edge Neural TTS.
- Animated movement, manual dragging, contextual companion states, and recovery from renderer failures.

## Requirements

- Windows 10 or Windows 11
- Node.js 18 or later
- A Google Gemini API key
- WhatsApp account access for the groups you intend to monitor

For local Operator inference, also install [Ollama](https://ollama.com/) and pull a compatible model:

```powershell
ollama pull qwen2.5:3b
```

Ollama is optional: when it is unavailable, Operator can use the configured Gemini model instead.

## Setup

Clone the repository and install dependencies:

```powershell
git clone https://github.com/cryoxyl-beep/Grumphy.git
cd Grumphy
npm install
```

Create a `.env` file in the project root. Start from [`.env.example`](.env.example):

```env
GEMINI_API_KEY=your_gemini_api_key_here
TARGET_GROUP_NAMES=Class Group,Academic Notices
LOG_LEVEL=info

# Optional local-agent configuration
OLLAMA_MODEL=qwen2.5:3b
GEMINI_AGENT_MODEL=gemini-3.8-flash
GEMINI_VISION_MODEL=gemini-3.8-flash
```

`TARGET_GROUP_NAMES` accepts comma-separated full names or distinctive fragments. Leave it empty to process messages from all group chats.

## Run

Launch the desktop application:

```powershell
npm run electron
```

On the first run, authenticate WhatsApp by scanning the QR code shown in the terminal. Session credentials are saved locally and excluded from Git.

For the standalone WhatsApp monitoring process, use:

```powershell
npm start
```

## Controls

| Action | Shortcut |
| --- | --- |
| Ask the companions a question | `Ctrl` + `Shift` + `Space` |
| Open Operator input | `Ctrl` + `Alt` + `Space` |
| Open companion controls | Right-click a companion |

The companion context menu also provides mute, position reset, individual dismissal, and application exit controls.

## Architecture

```text
WhatsApp Web groups
        |
        v
agent.js -> aiAnalyzer.js -> notifierService.js / alertsCache.js
        |                         |
        +-------------------------+--> Scout companion

Operator input -> aiAnalyzer.js -> Ollama or Gemini
                                      |
                                      v
                               systemTools.js -> Windows

petWindow.js -> petManager.js -> Electron companion windows
```

### Main modules

| Module | Responsibility |
| --- | --- |
| `petWindow.js` | Electron entry point, shortcuts, permissions, and IPC registration. |
| `petManager.js` | Companion window lifecycle, animation state, movement, and menus. |
| `agent.js` | WhatsApp event queue and academic-alert pipeline. |
| `aiAnalyzer.js` | Gemini analysis, conversational responses, local-agent orchestration, and vision requests. |
| `systemTools.js` | Validated Windows automation and diagnostics tools used by Operator. |
| `ttsService.js` | Microsoft Edge Neural TTS audio generation. |
| `spatialEngine.js` | Companion placement calculations for the desktop and application windows. |

## Operator Tools

Operator can invoke tools for:

- opening web URLs and web searches;
- launching and closing supported Windows applications;
- typing into the focused application and sending allowlisted key presses;
- clicking validated screen coordinates and capturing screenshots;
- locating UI elements through Gemini vision;
- collecting basic system diagnostics and appending quick notes; and
- installing software only after an explicit confirmation dialog.

Automation acts on the active desktop. Review an Operator request before sending it, and avoid using it with sensitive information or on shared machines.

## Data and Privacy

- WhatsApp authentication data is stored locally in `.wwebjs_auth/`.
- Alert data is cached locally in `alerts-cache.json`.
- Runtime logs are written to `logs/` when logging is enabled.
- WhatsApp message content is sent to Gemini for academic classification. Screenshots are sent to Gemini only when visual grounding is requested.
- Local Ollama inference stays on the machine; Gemini requests require network access.

Do not commit `.env`, WhatsApp session data, alert caches, or logs. These paths are already covered by [`.gitignore`](.gitignore).

## Development

| Command | Description |
| --- | --- |
| `npm run electron` | Start the Electron desktop application. |
| `npm start` | Start the WhatsApp academic-monitoring agent. |
| `npm run dev` | Start the monitoring agent with Nodemon. |
| `npm test` | Run the Electron verification suite. |

The verification suite covers the sprite assets, renderer behavior, Electron IPC, automation schemas, companion movement, and spatial calculations.

## Project Structure

```text
assets/pet-gifs/       Companion animation assets
sprites/               WebP sprite sheets
agent.js               WhatsApp monitoring pipeline
aiAnalyzer.js          AI analysis and Operator orchestration
petWindow.js           Electron application entry point
petManager.js          Companion windows and interaction logic
systemTools.js         Windows automation tool implementations
test-verification.js   Electron verification suite
```

## Contributing

Contributions are welcome. Please keep changes focused, avoid committing local credentials or generated session data, and run `npm test` before opening a pull request.

## License

This project is licensed under the [ISC License](https://opensource.org/license/isc-license-txt/), as declared in `package.json`.
