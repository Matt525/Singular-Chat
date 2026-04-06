# Singular Chat

A privacy-first, open-source desktop chat application — an offline-capable alternative to ChatGPT.

Built with **Tauri 2** (Rust backend) + **React + TypeScript + Tailwind CSS** frontend.

## Features

- **100% offline capable** — run local LLMs entirely on your machine via [Ollama](https://ollama.com)
- **Cloud models** — connect OpenAI, Anthropic (Claude), or Groq just by adding your API key
- **Custom Assistants** — create reusable assistants with names, system prompts, and model preferences (like ChatGPT's GPTs)
- **ChatGPT-like UI** — familiar sidebar, conversation history grouped by date, streaming responses with Markdown rendering
- **Local-first storage** — all conversations, settings, and API keys are stored in SQLite on your device
- **macOS native** — built with Tauri for a fast, native macOS experience

## Supported Models

### Local (via Ollama)
- Llama 3.2, Llama 3.1 (Meta)
- Gemma 2 (Google)
- Mistral, Mixtral
- Phi-3 (Microsoft)
- Qwen 2.5 (Alibaba)
- DeepSeek R1
- Code Llama
- Any model from [ollama.com/library](https://ollama.com/library)

### Cloud
- **OpenAI**: GPT-4o, GPT-4o mini, GPT-3.5 Turbo
- **Anthropic**: Claude Opus 4.5, Claude Sonnet 4.5, Claude Haiku 4.5
- **Groq**: Llama 3.3 70B, Mixtral 8x7B, Gemma 2 9B (ultra-fast inference)

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (latest stable)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your OS
- [Ollama](https://ollama.com) (optional, for local models)

## Development

```bash
# Install frontend dependencies
npm install

# Run in development mode (starts Vite + Tauri)
npm run tauri dev
```

## Build

```bash
# Build for production
npm run tauri build
```

The packaged app will be in `src-tauri/target/release/bundle/`.

## Setup

1. **Local models**: Install [Ollama](https://ollama.com), then download models via **Settings → Local Models**
2. **Cloud models**: Add your API keys via **Settings → API Keys**
3. **Custom Assistants**: Click **Explore Assistants** in the sidebar to create custom AI personas

## Architecture

```
├── src/                    # React frontend
│   ├── components/         # UI components (Sidebar, ChatArea, Modals, etc.)
│   ├── stores/             # Zustand state management
│   └── types/              # TypeScript types
└── src-tauri/              # Rust backend
    └── src/
        ├── lib.rs          # Tauri commands (get_conversations, send_message, etc.)
        ├── db.rs           # SQLite database layer
        └── models.rs       # AI provider integrations (Ollama, OpenAI, Anthropic, Groq)
```

## Privacy

- API keys are stored locally in SQLite (never sent to any intermediate server)
- Conversations are stored only on your device
- When using local models (Ollama), no data leaves your machine
- When using cloud providers, data goes directly from your device to the provider's API

## License

MIT
