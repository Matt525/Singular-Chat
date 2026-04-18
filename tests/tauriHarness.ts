import type {
  Assistant,
  Conversation,
  HfGgufFile,
  HfModelSearchResult,
  Message,
  OllamaModel,
  OllamaRuntimeStatus,
  Settings,
} from "../src/types";

type InvokeArgs = Record<string, unknown>;
type EventCallback<T = unknown> = (event: { payload: T }) => void;
type InvokeHandler = (args: InvokeArgs, harness: TauriHarness) => unknown | Promise<unknown>;

export interface TauriCall {
  command: string;
  args: InvokeArgs;
}

export interface TauriHarnessState {
  settings: Settings;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  assistants: Assistant[];
  ollamaRuntime: OllamaRuntimeStatus;
  ollamaModels: OllamaModel[];
  openaiModels: string[];
  xaiModels: string[];
  hfSearchResults: HfModelSearchResult[];
  hfFilesByRepo: Record<string, HfGgufFile[]>;
  cancelledConversationIds: string[];
  nextConversationId: number;
  nextAssistantId: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now() {
  return new Date().toISOString();
}

function createSettings(): Settings {
  return {
    openai_api_key: "",
    anthropic_api_key: "",
    groq_api_key: "",
    xai_api_key: "",
    default_model: "llama3.2",
    default_provider: "ollama",
    ollama_url: "http://localhost:11434",
    theme: "dark",
    show_full_model_picker: false,
    web_search_enabled: true,
  };
}

export function createDefaultHarnessState(): TauriHarnessState {
  return {
    settings: createSettings(),
    conversations: [],
    messages: {},
    assistants: [],
    ollamaRuntime: {
      installed: true,
      running: true,
      local_version: "0.1.0",
      latest_version: "0.1.1",
      update_available: true,
      platform: "test",
    },
    ollamaModels: [],
    openaiModels: ["gpt-4.1-mini", "gpt-4.1"],
    xaiModels: ["grok-4.20-reasoning", "grok-4"],
    hfSearchResults: [
      {
        id: "meta-llama/Llama-3.1-8B-Instruct-GGUF",
        downloads: 123456,
        likes: 2345,
        last_modified: "2026-04-01T00:00:00Z",
        pipeline_tag: "text-generation",
        private: false,
        gated: false,
      },
    ],
    hfFilesByRepo: {
      "meta-llama/Llama-3.1-8B-Instruct-GGUF": [
        { name: "Llama-3.1-8B-Instruct-Q4_K_M.gguf", size: 4_300_000_000 },
        { name: "Llama-3.1-8B-Instruct-Q5_K_M.gguf", size: 5_100_000_000 },
      ],
    },
    cancelledConversationIds: [],
    nextConversationId: 1,
    nextAssistantId: 1,
  };
}

export class TauriHarness {
  state = createDefaultHarnessState();
  calls: TauriCall[] = [];

  private listeners = new Map<string, Set<EventCallback>>();
  private handlers = new Map<string, InvokeHandler>();

  constructor() {
    this.installDefaultHandlers();
  }

  reset() {
    this.state = createDefaultHarnessState();
    this.calls = [];
    this.listeners.clear();
    this.handlers.clear();
    this.installDefaultHandlers();
  }

  setHandler(command: string, handler: InvokeHandler) {
    this.handlers.set(command, handler);
  }

  clearHandler(command: string) {
    this.handlers.delete(command);
  }

  getCalls(command?: string) {
    return command ? this.calls.filter((call) => call.command === command) : [...this.calls];
  }

  lastCall(command: string) {
    const calls = this.getCalls(command);
    return calls[calls.length - 1];
  }

  emit<T>(event: string, payload: T) {
    for (const cb of this.listeners.get(event) ?? []) {
      cb({ payload });
    }
  }

  invoke = async (command: string, args: InvokeArgs = {}) => {
    this.calls.push({ command, args: clone(args) });
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error(`No mock handler registered for "${command}".`);
    }
    return await handler(clone(args), this);
  };

  listen = async <T,>(event: string, callback: EventCallback<T>) => {
    const existing = this.listeners.get(event) ?? new Set<EventCallback>();
    existing.add(callback as EventCallback);
    this.listeners.set(event, existing);
    return () => {
      const current = this.listeners.get(event);
      current?.delete(callback as EventCallback);
      if (current && current.size === 0) {
        this.listeners.delete(event);
      }
    };
  };

  private installDefaultHandlers() {
    this.setHandler("get_settings", async () => clone(this.state.settings));

    this.setHandler("save_settings", async (args) => {
      const nextSettings = args.settings as Settings | undefined;
      if (!nextSettings) {
        throw new Error("save_settings requires a settings payload.");
      }
      this.state.settings = clone(nextSettings);
      return undefined;
    });

    this.setHandler("get_conversations", async () => clone(this.state.conversations));

    this.setHandler("create_conversation", async (args) => {
      const conversation: Conversation = {
        id: `conversation-${this.state.nextConversationId++}`,
        title: "New Chat",
        model: String(args.model ?? this.state.settings.default_model),
        provider: String(args.provider ?? this.state.settings.default_provider),
        assistant_id: (args.assistantId ?? args.assistant_id ?? null) as string | null,
        created_at: now(),
        updated_at: now(),
      };
      this.state.conversations = [conversation, ...this.state.conversations];
      this.state.messages[conversation.id] = [];
      return clone(conversation);
    });

    this.setHandler("delete_conversation", async (args) => {
      const id = String(args.id ?? "");
      this.state.conversations = this.state.conversations.filter((conv) => conv.id !== id);
      const nextMessages = { ...this.state.messages };
      delete nextMessages[id];
      this.state.messages = nextMessages;
      return undefined;
    });

    this.setHandler("rename_conversation", async (args) => {
      const id = String(args.id ?? "");
      const title = String(args.title ?? "");
      this.state.conversations = this.state.conversations.map((conv) =>
        conv.id === id ? { ...conv, title, updated_at: now() } : conv
      );
      return undefined;
    });

    this.setHandler("set_conversation_model_provider", async (args) => {
      const conversationId = String(args.conversationId ?? "");
      this.state.conversations = this.state.conversations.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              model: String(args.model ?? conv.model),
              provider: String(args.provider ?? conv.provider),
              updated_at: now(),
            }
          : conv
      );
      return undefined;
    });

    this.setHandler("get_messages", async (args) => {
      const conversationId = String(args.conversationId ?? "");
      return clone(this.state.messages[conversationId] ?? []);
    });

    this.setHandler("send_message", async () => undefined);
    this.setHandler("send_image_message", async () => undefined);

    this.setHandler("cancel_stream", async (args) => {
      const conversationId = String(args.conversationId ?? "");
      this.state.cancelledConversationIds.push(conversationId);
      return undefined;
    });

    this.setHandler("get_assistants", async () => clone(this.state.assistants));

    this.setHandler("create_assistant", async (args) => {
      const assistant: Assistant = {
        id: `assistant-${this.state.nextAssistantId++}`,
        name: String(args.name ?? ""),
        description: String(args.description ?? ""),
        system_prompt: String(args.systemPrompt ?? ""),
        model: String(args.model ?? this.state.settings.default_model),
        provider: String(args.provider ?? this.state.settings.default_provider),
        avatar_color: String(args.avatarColor ?? "#10a37f"),
        created_at: now(),
      };
      this.state.assistants = [assistant, ...this.state.assistants];
      return clone(assistant);
    });

    this.setHandler("update_assistant", async (args) => {
      const assistant = args.assistant as Assistant | undefined;
      if (!assistant) {
        throw new Error("update_assistant requires an assistant payload.");
      }
      this.state.assistants = this.state.assistants.map((item) =>
        item.id === assistant.id ? clone(assistant) : item
      );
      return undefined;
    });

    this.setHandler("delete_assistant", async (args) => {
      const id = String(args.id ?? "");
      this.state.assistants = this.state.assistants.filter((assistant) => assistant.id !== id);
      return undefined;
    });

    this.setHandler("check_ollama", async () => this.state.ollamaRuntime.running);

    this.setHandler("get_ollama_runtime_status", async () => clone(this.state.ollamaRuntime));

    this.setHandler("install_or_update_ollama", async () => {
      this.state.ollamaRuntime = {
        ...this.state.ollamaRuntime,
        installed: true,
        running: true,
        update_available: false,
        local_version: this.state.ollamaRuntime.latest_version ?? "0.1.1",
      };
      return "Ollama install/update completed.";
    });

    this.setHandler("get_ollama_models", async () => clone(this.state.ollamaModels));
    this.setHandler("get_openai_models", async () => clone(this.state.openaiModels));
    this.setHandler("get_xai_models", async () => clone(this.state.xaiModels));

    this.setHandler("pull_ollama_model", async (args) => {
      const modelName = String(args.modelName ?? "");
      if (!modelName) {
        throw new Error("pull_ollama_model requires modelName.");
      }
      this.state.ollamaModels = [
        ...this.state.ollamaModels.filter((model) => model.name !== modelName),
        {
          name: modelName,
          size: 4_300_000_000,
          modified_at: now(),
        },
      ];
      this.emit("model-pull-progress", {
        model: modelName,
        status: "Completed",
        completed: 1,
        total: 1,
      });
      return undefined;
    });

    this.setHandler("delete_ollama_model", async (args) => {
      const modelName = String(args.modelName ?? "");
      this.state.ollamaModels = this.state.ollamaModels.filter((model) => model.name !== modelName);
      return undefined;
    });

    this.setHandler("import_local_gguf_model", async (args) => {
      const modelName = String(args.modelName ?? "");
      if (!modelName) {
        throw new Error("import_local_gguf_model requires modelName.");
      }
      this.state.ollamaModels = [
        ...this.state.ollamaModels.filter((model) => model.name !== modelName),
        {
          name: modelName,
          size: 5_100_000_000,
          modified_at: now(),
        },
      ];
      this.emit("local-model-import-progress", {
        stage: "import",
        model: modelName,
        status: "Import complete",
        completed: 1,
        total: 1,
      });
      return undefined;
    });

    this.setHandler("list_hf_gguf_files", async (args) => {
      const repoId = String(args.repoId ?? "");
      return clone(this.state.hfFilesByRepo[repoId] ?? []);
    });

    this.setHandler("search_hf_models", async () => clone(this.state.hfSearchResults));

    this.setHandler("download_hf_and_import_model", async (args) => {
      const modelName = String(args.modelName ?? "");
      if (!modelName) {
        throw new Error("download_hf_and_import_model requires modelName.");
      }
      this.emit("local-model-import-progress", {
        stage: "download",
        model: modelName,
        status: "Downloading from Hugging Face",
        completed: 1,
        total: 2,
      });
      this.emit("local-model-import-progress", {
        stage: "import",
        model: modelName,
        status: "Importing into Ollama",
        completed: 2,
        total: 2,
      });
      this.state.ollamaModels = [
        ...this.state.ollamaModels.filter((model) => model.name !== modelName),
        {
          name: modelName,
          size: 4_300_000_000,
          modified_at: now(),
        },
      ];
      return undefined;
    });
  }
}

export function createTauriHarness() {
  return new TauriHarness();
}
