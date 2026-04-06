import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  Assistant,
  Conversation,
  Message,
  ModelOption,
  OllamaModel,
  Settings,
  StreamChunk,
} from "../types";
import { STATIC_MODELS } from "../types";

interface AppStore {
  // Data
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Record<string, Message[]>;
  assistants: Assistant[];
  settings: Settings;
  ollamaModels: OllamaModel[];
  ollamaOnline: boolean;

  // UI State
  isStreaming: boolean;
  streamingConversationId: string | null;
  streamingContent: string;
  isLoadingMessages: boolean;

  // Modals
  showSettings: boolean;
  showAssistants: boolean;

  // Computed
  allModels: () => ModelOption[];
  currentMessages: () => Message[];
  currentConversation: () => Conversation | undefined;

  // Actions
  init: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadAssistants: () => Promise<void>;
  refreshOllamaModels: () => Promise<void>;

  selectConversation: (id: string) => Promise<void>;
  createNewChat: (model?: string, provider?: string, assistantId?: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  sendMessage: (content: string) => Promise<void>;

  saveSettings: (s: Partial<Settings>) => Promise<void>;

  createAssistant: (
    name: string,
    description: string,
    systemPrompt: string,
    model: string,
    provider: string,
    avatarColor: string
  ) => Promise<void>;
  updateAssistant: (a: Assistant) => Promise<void>;
  deleteAssistant: (id: string) => Promise<void>;

  pullOllamaModel: (name: string) => Promise<void>;
  deleteOllamaModel: (name: string) => Promise<void>;

  setShowSettings: (v: boolean) => void;
  setShowAssistants: (v: boolean) => void;

  // Active model selection (session state)
  selectedModel: string;
  selectedProvider: string;
  setSelectedModel: (model: string, provider: string) => void;
}

const DEFAULT_SETTINGS: Settings = {
  openai_api_key: "",
  anthropic_api_key: "",
  groq_api_key: "",
  default_model: "llama3.2",
  default_provider: "ollama",
  ollama_url: "http://localhost:11434",
  theme: "dark",
};

let streamUnlisten: UnlistenFn | null = null;

export const useAppStore = create<AppStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: {},
  assistants: [],
  settings: DEFAULT_SETTINGS,
  ollamaModels: [],
  ollamaOnline: false,
  isStreaming: false,
  streamingConversationId: null,
  streamingContent: "",
  isLoadingMessages: false,
  showSettings: false,
  showAssistants: false,
  selectedModel: "llama3.2",
  selectedProvider: "ollama",

  allModels: () => {
    const { settings, ollamaModels } = get();
    const local: ModelOption[] = ollamaModels.map((m) => ({
      id: m.name,
      name: m.name,
      provider: "ollama",
      description: `${(m.size / 1e9).toFixed(1)} GB`,
    }));
    const cloud = STATIC_MODELS.filter((m) => {
      if (m.provider === "openai") return !!settings.openai_api_key;
      if (m.provider === "anthropic") return !!settings.anthropic_api_key;
      if (m.provider === "groq") return !!settings.groq_api_key;
      return false;
    });
    return [...local, ...cloud];
  },

  currentMessages: () => {
    const { currentConversationId, messages, isStreaming, streamingContent, streamingConversationId } = get();
    if (!currentConversationId) return [];
    const msgs = messages[currentConversationId] ?? [];
    if (isStreaming && streamingConversationId === currentConversationId && streamingContent) {
      return [
        ...msgs,
        {
          id: "__streaming__",
          conversation_id: currentConversationId,
          role: "assistant" as const,
          content: streamingContent,
          created_at: new Date().toISOString(),
        },
      ];
    }
    return msgs;
  },

  currentConversation: () => {
    const { conversations, currentConversationId } = get();
    return conversations.find((c) => c.id === currentConversationId);
  },

  // ── Init ──────────────────────────────────────────────────────────────────

  init: async () => {
    await Promise.all([get().loadSettings(), get().loadConversations(), get().loadAssistants()]);

    // Check Ollama and load models
    const online = await invoke<boolean>("check_ollama").catch(() => false);
    set({ ollamaOnline: online });
    if (online) {
      await get().refreshOllamaModels();
    }

    // Set default model from settings
    const { settings } = get();
    set({
      selectedModel: settings.default_model,
      selectedProvider: settings.default_provider,
    });

    // Set up streaming listener
    if (streamUnlisten) streamUnlisten();
    streamUnlisten = await listen<StreamChunk>("chat-stream", (event) => {
      const { conversation_id, chunk, done } = event.payload;
      if (done) {
        // Finalize: reload messages for the conversation
        const store = get();
        set({ isStreaming: false, streamingContent: "", streamingConversationId: null });
        invoke<Message[]>("get_messages", { conversationId: conversation_id })
          .then((msgs) => {
            set((s) => ({
              messages: { ...s.messages, [conversation_id]: msgs },
            }));
          })
          .catch(console.error);
        // Reload conversations to get updated title/timestamp
        store.loadConversations();
      } else {
        set((s) => ({
          streamingContent: s.streamingContent + chunk,
          streamingConversationId: conversation_id,
        }));
      }
    });
  },

  loadConversations: async () => {
    const convs = await invoke<Conversation[]>("get_conversations");
    set({ conversations: convs });
  },

  loadSettings: async () => {
    const settings = await invoke<Settings>("get_settings");
    set({ settings });
  },

  loadAssistants: async () => {
    const assistants = await invoke<Assistant[]>("get_assistants");
    set({ assistants });
  },

  refreshOllamaModels: async () => {
    const models = await invoke<OllamaModel[]>("get_ollama_models").catch(() => [] as OllamaModel[]);
    set({ ollamaModels: models });
  },

  // ── Conversations ─────────────────────────────────────────────────────────

  selectConversation: async (id) => {
    set({ currentConversationId: id, isLoadingMessages: true });
    const msgs = await invoke<Message[]>("get_messages", { conversationId: id });
    set((s) => ({
      messages: { ...s.messages, [id]: msgs },
      isLoadingMessages: false,
    }));
  },

  createNewChat: async (model, provider, assistantId) => {
    const { selectedModel, selectedProvider, settings } = get();
    const m = model ?? selectedModel ?? settings.default_model;
    const p = provider ?? selectedProvider ?? settings.default_provider;
    const conv = await invoke<Conversation>("create_conversation", {
      model: m,
      provider: p,
      assistantId: assistantId ?? null,
    });
    set((s) => ({
      conversations: [conv, ...s.conversations],
      currentConversationId: conv.id,
      messages: { ...s.messages, [conv.id]: [] },
    }));
  },

  deleteConversation: async (id) => {
    await invoke("delete_conversation", { id });
    set((s) => {
      const convs = s.conversations.filter((c) => c.id !== id);
      const newMessages = { ...s.messages };
      delete newMessages[id];
      return {
        conversations: convs,
        currentConversationId: s.currentConversationId === id ? null : s.currentConversationId,
        messages: newMessages,
      };
    });
  },

  renameConversation: async (id, title) => {
    await invoke("rename_conversation", { id, title });
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  // ── Messaging ─────────────────────────────────────────────────────────────

  sendMessage: async (content) => {
    const { currentConversationId, selectedModel, selectedProvider } = get();
    if (!currentConversationId || !content.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: currentConversationId,
      role: "user",
      content: content.trim(),
      created_at: new Date().toISOString(),
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [currentConversationId]: [...(s.messages[currentConversationId] ?? []), userMsg],
      },
      isStreaming: true,
      streamingContent: "",
      streamingConversationId: currentConversationId,
    }));

    try {
      await invoke("send_message", {
        conversationId: currentConversationId,
        content: content.trim(),
        model: selectedModel,
        provider: selectedProvider,
      });
    } catch (error) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        conversation_id: currentConversationId,
        role: "assistant",
        content: `**Error:** ${error}`,
        created_at: new Date().toISOString(),
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [currentConversationId]: [
            ...(s.messages[currentConversationId] ?? []).filter((m) => m.id !== "__streaming__"),
            errMsg,
          ],
        },
        isStreaming: false,
        streamingContent: "",
        streamingConversationId: null,
      }));
    }
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial };
    await invoke("save_settings", { settings: merged });
    set({ settings: merged });
    // Refresh Ollama if URL changed
    if (partial.ollama_url !== undefined) {
      const online = await invoke<boolean>("check_ollama").catch(() => false);
      set({ ollamaOnline: online });
      if (online) await get().refreshOllamaModels();
    }
  },

  // ── Assistants ────────────────────────────────────────────────────────────

  createAssistant: async (name, description, systemPrompt, model, provider, avatarColor) => {
    const assistant = await invoke<Assistant>("create_assistant", {
      name,
      description,
      systemPrompt,
      model,
      provider,
      avatarColor,
    });
    set((s) => ({ assistants: [assistant, ...s.assistants] }));
  },

  updateAssistant: async (assistant) => {
    await invoke("update_assistant", { assistant });
    set((s) => ({
      assistants: s.assistants.map((a) => (a.id === assistant.id ? assistant : a)),
    }));
  },

  deleteAssistant: async (id) => {
    await invoke("delete_assistant", { id });
    set((s) => ({ assistants: s.assistants.filter((a) => a.id !== id) }));
  },

  // ── Ollama model management ───────────────────────────────────────────────

  pullOllamaModel: async (name) => {
    await invoke("pull_ollama_model", { modelName: name });
    await get().refreshOllamaModels();
  },

  deleteOllamaModel: async (name) => {
    await invoke("delete_ollama_model", { modelName: name });
    await get().refreshOllamaModels();
  },

  // ── Modal toggles ─────────────────────────────────────────────────────────

  setShowSettings: (v) => set({ showSettings: v }),
  setShowAssistants: (v) => set({ showAssistants: v }),

  setSelectedModel: (model, provider) => set({ selectedModel: model, selectedProvider: provider }),
}));
