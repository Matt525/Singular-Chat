# Singular Chat

Singular Chat is a privacy-first desktop chat app for local and cloud models.
It is built with Tauri 2, React, TypeScript, Tailwind CSS, and SQLite.

## Dependencies

### Required on macOS

- Node.js 18 or newer
- Rust stable
- Xcode Command Line Tools

### Optional

- Ollama for local model support
- API keys for OpenAI, Anthropic, Groq, or xAI if you want cloud models

### Project dependencies already included in the repo

- Frontend: `react`, `react-dom`, `vite`, `typescript`, `tailwindcss`, `zustand`
- Desktop shell: `@tauri-apps/api`, `@tauri-apps/cli`, `@tauri-apps/plugin-shell`
- Rust backend: `tauri`, `rusqlite`, `tokio`, `reqwest`, `serde`, `serde_json`, `uuid`, `chrono`

The repository also commits `package-lock.json` and `src-tauri/Cargo.lock` so installs stay reproducible across machines.

## Fastest macOS setup

1. Install the macOS command line tools:

   ```bash
   xcode-select --install
   ```

2. Install Node.js 18+ and Rust stable if they are not already installed.

3. Clone the repository:

   ```bash
   git clone https://github.com/Matt525/Singular-Chat.git
   cd Singular-Chat
   ```

4. Install the app dependencies:

   ```bash
   npm install
   ```

5. Launch the desktop app:

   ```bash
   npm run tauri dev
   ```

`npm run dev` starts the browser-only Vite preview. Use `npm run tauri dev` when you want the actual desktop app with the Rust backend, local storage, and native integrations.

## Build a macOS app

```bash
npm run tauri build
```

The macOS bundle is written under `src-tauri/target/release/bundle/macos/`.

## Local model setup

1. Install Ollama if you want offline model support.
2. Open Singular Chat and go to the Local Models panel to pull a model.
3. If you want cloud models, open Settings and add your API keys there.

## What is inside

- `src/` - React frontend
- `src/components/` - Chat UI, settings, model selectors, and modal panels
- `src/stores/` - Zustand state management
- `src/types/` - shared TypeScript types
- `src-tauri/` - Rust backend, database layer, and model integrations

## Privacy

- Conversations are stored locally on your machine.
- API keys are stored locally in SQLite.
- Ollama traffic stays on your device.
- Cloud model requests are sent directly from your machine to the provider.

## License

MIT
