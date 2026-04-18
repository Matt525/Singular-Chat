import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  Assistant,
  Conversation,
  HfGgufFile,
  HfModelSearchResult,
  Message,
  ModelDebugEvent,
  ModelOption,
  OllamaModel,
  OllamaRuntimeStatus,
  Provider,
  Settings,
  StreamChunk,
  ToolStatusEvent,
} from "../types";
import { STATIC_MODELS } from "../types";

const REASONING_HINTS = ["reasoning", "reasoner", "thinking"];
const NON_REASONING_HINTS = ["non-reasoning", "non_reasoning", "nonreasoning", "instant"];
const IMAGE_HINTS = ["imagine", "image", "vision-image"];
const OPENAI_CHAT_EXCLUDES = [
  "image",
  "audio",
  "realtime",
  "transcribe",
  "tts",
  "embedding",
  "moderation",
  "video",
  "sora",
  "computer-use",
  "deep-research",
  "search-preview",
  "search",
];

function containsHint(input: string, hints: string[]) {
  const value = input.toLowerCase();
  return hints.some((hint) => value.includes(hint));
}

function isImageGenerationModel(model: ModelOption): boolean {
  return containsHint(model.id, IMAGE_HINTS) || containsHint(model.name, IMAGE_HINTS);
}

function isReasoningModel(model: ModelOption): boolean {
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  if (containsHint(id, NON_REASONING_HINTS) || containsHint(name, NON_REASONING_HINTS)) {
    return false;
  }
  return containsHint(id, REASONING_HINTS) || containsHint(name, REASONING_HINTS);
}

function isNonReasoningModel(model: ModelOption): boolean {
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  if (containsHint(id, NON_REASONING_HINTS) || containsHint(name, NON_REASONING_HINTS)) {
    return true;
  }
  return !isReasoningModel(model);
}

function normalizeOpenAIModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/^chatgpt-/, "gpt-")
    .replace(/^openai\//, "")
    .replace(/^openai-/, "")
    .replace(/:\d{4}-\d{2}-\d{2}$/g, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/g, "");
}

function isOpenAIChatModelId(modelId: string): boolean {
  const lower = normalizeOpenAIModelId(modelId);
  if (!(lower.startsWith("gpt-") || lower.startsWith("o"))) {
    return false;
  }
  return !OPENAI_CHAT_EXCLUDES.some((hint) => lower.includes(hint));
}

function xaiFamilyKey(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  const match = lower.match(/\bgrok-(\d+(?:\.\d+)?)(-mini)?/);
  if (!match) {
    return null;
  }
  const version = match[1];
  const miniSuffix = match[2] ? "-mini" : "";
  return `grok-${version}${miniSuffix}`;
}

function modelFamilyKey(provider: Provider, modelId: string): string {
  if (provider === "ollama") return modelId.toLowerCase();
  if (provider === "openai") {
    return normalizeOpenAIModelId(modelId)
      .replace(/-latest/g, "")
      .replace(/-beta/g, "")
      .replace(/-preview/g, "")
      .replace(/-mini/g, "-mini")
      .replace(/-nano/g, "-nano")
      .replace(/-pro/g, "-pro")
      .replace(/[-_]+$/g, "");
  }
  if (provider === "xai") {
    const family = xaiFamilyKey(modelId);
    if (family) {
      return family;
    }
  }
  return modelId
    .toLowerCase()
    .replace(/:latest$/g, "")
    .replace(/-latest/g, "")
    .replace(/-beta/g, "")
    .replace(/-preview/g, "")
    .replace(/-non[-_]?reasoning/g, "")
    .replace(/-reasoning/g, "")
    .replace(/-reasoner/g, "")
    .replace(/-thinking/g, "")
    .replace(/-multi[-_]?agent/g, "")
    .replace(/[-_]+$/g, "");
}

function makeCompactDisplayName(model: ModelOption): string {
  const id = model.id.toLowerCase();
  if (model.provider === "openai") {
    const normalized = normalizeOpenAIModelId(id)
      .replace(/-latest/g, "")
      .replace(/-beta/g, "")
      .replace(/-preview/g, "");
    const parts = normalized.split("-").filter(Boolean);
    if (parts.length === 0) {
      return "GPT";
    }
    const head = parts.shift() ?? "";
    const headLabel = head.startsWith("gpt") ? head.replace(/^gpt/i, "GPT") : head;
    if (parts.length === 0) {
      return headLabel;
    }
    return [`${headLabel}-${parts.shift()}`, ...parts].join(" ").trim();
  }
  if (model.provider === "xai") {
    const family = xaiFamilyKey(id);
    if (family === "grok-4.20") return "Grok 4.20";
    if (family === "grok-4") return "Grok 4";
    if (family === "grok-3-mini") return "Grok 3 Mini";
    if (family === "grok-3") return "Grok 3";
  }

  const cleaned = model.name
    .replace(/\s*\(non[-\s]?reasoning\)/gi, "")
    .replace(/\s*\(reasoning\)/gi, "")
    .replace(/\s*\(multi[-\s]?agent\)/gi, "")
    .trim();
  return cleaned;
}

function pickVariant(candidates: ModelOption[], preferReasoning: boolean): ModelOption {
  if (candidates.length === 0) {
    throw new Error("No model candidates available");
  }
  if (preferReasoning) {
    const preferredReasoning = candidates.find((m) => isReasoningModel(m));
    if (preferredReasoning) return preferredReasoning;
    return candidates[0];
  }
  const preferredNonReasoning = candidates.find((m) => isNonReasoningModel(m));
  if (preferredNonReasoning) return preferredNonReasoning;
  return candidates[0];
}

function compactCandidatePriority(model: ModelOption): number {
  const id = model.id.toLowerCase();
  let score = 0;
  if (isNonReasoningModel(model)) score += 30;
  if (!id.includes("latest")) score += 8;
  if (!id.includes("beta")) score += 6;
  if (!id.includes("preview")) score += 6;
  if (!/-\d{4,}/.test(id)) score += 4;
  return score;
}

function compactModelOptions(models: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  const compact: ModelOption[] = [];
  for (const model of models) {
    const key = `${model.provider}::${modelFamilyKey(model.provider, model.id)}`;
    if (seen.has(key)) {
      continue;
    }
    const group = models.filter(
      (m) =>
        m.provider === model.provider &&
        modelFamilyKey(m.provider, m.id) === modelFamilyKey(model.provider, model.id)
    );
    const chosen = pickVariant(group, false);
    compact.push({
      ...chosen,
      name: makeCompactDisplayName(chosen),
      description: undefined,
    });
    seen.add(key);
  }
  const dedupedByLabel = new Map<string, ModelOption>();
  for (const model of compact) {
    const labelKey = `${model.provider}::${model.name.toLowerCase()}`;
    const existing = dedupedByLabel.get(labelKey);
    if (!existing || compactCandidatePriority(model) > compactCandidatePriority(existing)) {
      dedupedByLabel.set(labelKey, model);
    }
  }

  return Array.from(dedupedByLabel.values()).sort((a, b) => {
    if (a.provider === b.provider) {
      return a.name.localeCompare(b.name);
    }
    return a.provider.localeCompare(b.provider);
  });
}

function resolveRuntimeModelId(
  provider: Provider,
  selectedModel: string,
  availableModels: ModelOption[],
  reasoningEnabled: boolean
): string {
  const sameProvider = availableModels.filter((m) => m.provider === provider);
  if (sameProvider.length === 0) {
    return selectedModel;
  }

  const family = modelFamilyKey(provider, selectedModel);
  const sameFamily = sameProvider.filter((m) => modelFamilyKey(provider, m.id) === family);
  if (sameFamily.length === 0) {
    return selectedModel;
  }

  if (provider === "xai" && family.includes("grok-4.20")) {
    const exact = sameFamily.find((m) =>
      reasoningEnabled
        ? m.id.toLowerCase().includes("grok-4.20-reasoning")
        : m.id.toLowerCase().includes("non-reasoning")
    );
    if (exact) {
      return exact.id;
    }
  }

  return pickVariant(sameFamily, reasoningEnabled).id;
}

interface AppStore {
  // Data
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Record<string, Message[]>;
  assistants: Assistant[];
  settings: Settings;
  ollamaModels: OllamaModel[];
  openaiModels: string[];
  xaiModels: string[];
  ollamaOnline: boolean;
  ollamaRuntime: OllamaRuntimeStatus | null;
  modelDebugByConversation: Record<
    string,
    { provider?: string; requested_model?: string; response_model?: string }
  >;
  toolStatusByConversation: Record<string, string | undefined>;

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
  currentModelDebug: () =>
    | { provider?: string; requested_model?: string; response_model?: string }
    | undefined;
  currentToolStatus: () => string | undefined;
  allModelsRaw: () => ModelOption[];

  // Actions
  init: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadAssistants: () => Promise<void>;
  refreshOllamaModels: () => Promise<void>;
  refreshOllamaRuntime: () => Promise<void>;
  installOrUpdateOllama: () => Promise<string>;
  refreshOpenAIModels: () => Promise<void>;
  refreshXaiModels: () => Promise<void>;

  selectConversation: (id: string) => Promise<void>;
  createNewChat: (model?: string, provider?: string, assistantId?: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  sendMessage: (content: string) => Promise<void>;
  sendImageMessage: (content: string) => Promise<void>;
  stopStreaming: () => Promise<void>;

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
  importLocalGgufModel: (modelName: string, ggufPath: string) => Promise<void>;
  listHfGgufFiles: (repoId: string, hfToken?: string) => Promise<HfGgufFile[]>;
  searchHfModels: (
    query: string,
    options?: { hfToken?: string; limit?: number }
  ) => Promise<HfModelSearchResult[]>;
  downloadHfAndImportModel: (params: {
    repoId: string;
    fileName: string;
    modelName: string;
    revision?: string;
    hfToken?: string;
  }) => Promise<void>;

  setShowSettings: (v: boolean) => void;
  setShowAssistants: (v: boolean) => void;

  // Active model selection (session state)
  selectedModel: string;
  selectedProvider: string;
  reasoningEnabled: boolean;
  imageGenEnabled: boolean;
  setSelectedModel: (model: string, provider: string) => void;
  setReasoningEnabled: (enabled: boolean) => void;
  setImageGenEnabled: (enabled: boolean) => void;
}

const DEFAULT_SETTINGS: Settings = {
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

let streamUnlisten: UnlistenFn | null = null;
let modelDebugUnlisten: UnlistenFn | null = null;
let toolStatusUnlisten: UnlistenFn | null = null;
let initPromise: Promise<void> | null = null;
let initCompleted = false;

export const useAppStore = create<AppStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: {},
  assistants: [],
  settings: DEFAULT_SETTINGS,
  ollamaModels: [],
  openaiModels: [],
  xaiModels: [],
  ollamaOnline: false,
  ollamaRuntime: null,
  modelDebugByConversation: {},
  toolStatusByConversation: {},
  isStreaming: false,
  streamingConversationId: null,
  streamingContent: "",
  isLoadingMessages: false,
  showSettings: false,
  showAssistants: false,
  selectedModel: "llama3.2",
  selectedProvider: "ollama",
  reasoningEnabled: false,
  imageGenEnabled: false,

  allModelsRaw: () => {
    const { settings, ollamaModels, openaiModels, xaiModels } = get();
    const local: ModelOption[] = ollamaModels.map((m) => ({
      id: m.name,
      name: m.name,
      provider: "ollama",
      description: `${(m.size / 1e9).toFixed(1)} GB`,
    }));

    const otherCloud = STATIC_MODELS.filter((m) => {
      if (m.provider === "anthropic") return !!settings.anthropic_api_key;
      if (m.provider === "groq") return !!settings.groq_api_key;
      if (m.provider === "openai") return false;
      if (m.provider === "xai") return false;
      return false;
    });

    const staticOpenAI = STATIC_MODELS.filter(
      (m) => m.provider === "openai" && isOpenAIChatModelId(m.id)
    );
    const dynamicOpenAI: ModelOption[] = openaiModels
      .filter((id) => isOpenAIChatModelId(id))
      .map((id) => ({
        id,
        name: makeCompactDisplayName({ id, name: id, provider: "openai" }),
        provider: "openai",
        description: "Available for your OpenAI API key",
      }));
    const openaiCloud =
      settings.openai_api_key && dynamicOpenAI.length > 0 ? dynamicOpenAI : staticOpenAI;

    const staticXai = STATIC_MODELS.filter((m) => m.provider === "xai");
    const staticXaiById = new Map(staticXai.map((m) => [m.id, m]));
    const dynamicXai: ModelOption[] = xaiModels.map((id) => {
      const known = staticXaiById.get(id);
      return {
        id,
        name: known?.name ?? id,
        provider: "xai",
        description: known?.description ?? "Available for your xAI API key",
      };
    });

    const xaiCloud =
      settings.xai_api_key && dynamicXai.length > 0 ? dynamicXai : settings.xai_api_key ? staticXai : [];

    return [...local, ...openaiCloud, ...otherCloud, ...xaiCloud].filter(
      (m) => !isImageGenerationModel(m)
    );
  },

  allModels: () => {
    const { settings } = get();
    const raw = get().allModelsRaw();
    if (settings.show_full_model_picker) {
      return raw;
    }
    return compactModelOptions(raw);
  },

  currentMessages: () => {
    const { currentConversationId, messages, isStreaming, streamingContent, streamingConversationId } = get();
    if (!currentConversationId) return [];
    const msgs = messages[currentConversationId] ?? [];
    if (isStreaming && streamingConversationId === currentConversationId) {
      return [
        ...msgs,
        {
          id: "__streaming__",
          conversation_id: currentConversationId,
          role: "assistant" as const,
          content: streamingContent,
          created_at: new Date().toISOString(),
          used_web: false,
        },
      ];
    }
    return msgs;
  },

  currentConversation: () => {
    const { conversations, currentConversationId } = get();
    return conversations.find((c) => c.id === currentConversationId);
  },

  currentModelDebug: () => {
    const { currentConversationId, modelDebugByConversation } = get();
    if (!currentConversationId) return undefined;
    return modelDebugByConversation[currentConversationId];
  },

  currentToolStatus: () => {
    const { currentConversationId, toolStatusByConversation } = get();
    if (!currentConversationId) return undefined;
    return toolStatusByConversation[currentConversationId];
  },

  // ── Init ──────────────────────────────────────────────────────────────────

  init: async () => {
    if (initCompleted) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      await Promise.all([
        get().loadSettings().catch((e) => {
          console.error("Failed to load settings:", e);
          set({ settings: DEFAULT_SETTINGS });
        }),
        get().loadConversations().catch((e) => {
          console.error("Failed to load conversations:", e);
          set({ conversations: [] });
        }),
        get().loadAssistants().catch((e) => {
          console.error("Failed to load assistants:", e);
          set({ assistants: [] });
        }),
      ]);

      const settings = get().settings;
      const runtimeTask = get().refreshOllamaRuntime().catch((e) => {
        console.error("Failed to check Ollama runtime:", e);
        set({ ollamaOnline: false, ollamaRuntime: null });
      });
      const openaiTask = settings.openai_api_key
        ? get().refreshOpenAIModels().catch((e) => {
            console.error("Failed to load OpenAI models:", e);
            set({ openaiModels: [] });
          })
        : Promise.resolve().then(() => {
            set({ openaiModels: [] });
          });
      const xaiTask = settings.xai_api_key
        ? get().refreshXaiModels().catch((e) => {
            console.error("Failed to load xAI models:", e);
            set({ xaiModels: [] });
          })
        : Promise.resolve().then(() => {
            set({ xaiModels: [] });
          });

      await Promise.all([runtimeTask, openaiTask, xaiTask]);
      if (get().ollamaOnline) {
        await get().refreshOllamaModels().catch((e) => {
          console.error("Failed to load Ollama models:", e);
          set({ ollamaModels: [] });
        });
      } else {
        set({ ollamaModels: [] });
      }

      // Set default model from settings
      set({
        selectedModel: settings.default_model,
        selectedProvider: settings.default_provider,
      });

      // Set up streaming listener
      if (streamUnlisten) streamUnlisten();
      if (modelDebugUnlisten) modelDebugUnlisten();
      if (toolStatusUnlisten) toolStatusUnlisten();
      streamUnlisten = await listen<StreamChunk>("chat-stream", (event) => {
        const { conversation_id, chunk, done } = event.payload;
        if (done) {
          // Finalize: reload messages for the conversation
          const store = get();
          const finalContent =
            store.streamingConversationId === conversation_id ? store.streamingContent : "";
          set((s) => {
            const existing = s.messages[conversation_id] ?? [];
            const shouldAppend =
              finalContent.trim().length > 0 &&
              (existing.length === 0 ||
                existing[existing.length - 1].role !== "assistant" ||
                existing[existing.length - 1].content !== finalContent);
            const nextMessages = shouldAppend
              ? [
                  ...existing,
                  {
                    id: `assistant-stream-final-${Date.now()}`,
                    conversation_id,
                    role: "assistant" as const,
                    content: finalContent,
                    created_at: new Date().toISOString(),
                    used_web: false,
                  },
                ]
              : existing;
            return {
              messages: {
                ...s.messages,
                [conversation_id]: nextMessages,
              },
              toolStatusByConversation: {
                ...s.toolStatusByConversation,
                [conversation_id]: undefined,
              },
              isStreaming: false,
              streamingContent: "",
              streamingConversationId: null,
            };
          });
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
            streamingContent:
              s.streamingConversationId !== conversation_id
                ? chunk
                : s.streamingContent + chunk,
            streamingConversationId: conversation_id,
          }));
        }
      });

      modelDebugUnlisten = await listen<ModelDebugEvent>("chat-model-debug", (event) => {
        const payload = event.payload;
        const conversationId = payload.conversation_id;
        if (!conversationId) return;
        set((s) => {
          const prev = s.modelDebugByConversation[conversationId] ?? {};
          return {
            modelDebugByConversation: {
              ...s.modelDebugByConversation,
              [conversationId]: {
                provider: payload.provider ?? prev.provider,
                requested_model: payload.requested_model ?? prev.requested_model,
                response_model:
                  payload.phase === "request"
                    ? undefined
                    : payload.response_model ?? prev.response_model,
              },
            },
          };
        });
      });

      toolStatusUnlisten = await listen<ToolStatusEvent>("chat-tool-status", (event) => {
        const payload = event.payload;
        const conversationId = payload.conversation_id;
        if (!conversationId) return;
        set((s) => ({
          toolStatusByConversation: {
            ...s.toolStatusByConversation,
            [conversationId]: payload.active ? payload.status : undefined,
          },
        }));
      });
    })();

    try {
      await initPromise;
      initCompleted = true;
    } finally {
      initPromise = null;
    }
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
    const models = await invoke<OllamaModel[]>("get_ollama_models");
    set({ ollamaModels: models });
  },

  refreshOllamaRuntime: async () => {
    const runtime = await invoke<OllamaRuntimeStatus>("get_ollama_runtime_status");
    set({
      ollamaRuntime: runtime,
      ollamaOnline: runtime.running,
    });
  },

  installOrUpdateOllama: async () => {
    const result = await invoke<string>("install_or_update_ollama");
    await get().refreshOllamaRuntime().catch((e) => {
      console.error("Failed to refresh Ollama runtime after install/update:", e);
    });
    if (get().ollamaOnline) {
      await get().refreshOllamaModels().catch((e) => {
        console.error("Failed to refresh Ollama models after install/update:", e);
      });
    }
    return result;
  },

  refreshXaiModels: async () => {
    const models = await invoke<string[]>("get_xai_models");
    set({ xaiModels: models });
  },

  refreshOpenAIModels: async () => {
    const models = await invoke<string[]>("get_openai_models");
    set({ openaiModels: models });
  },

  // ── Conversations ─────────────────────────────────────────────────────────

  selectConversation: async (id) => {
    set({ currentConversationId: id, isLoadingMessages: true });
    try {
      const msgs = await invoke<Message[]>("get_messages", { conversationId: id });
      set((s) => ({
        messages: { ...s.messages, [id]: msgs },
        isLoadingMessages: false,
      }));
    } catch (error) {
      console.error("Failed to load conversation messages:", error);
      set({ isLoadingMessages: false });
      throw error;
    }
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
    const { currentConversationId, selectedModel, selectedProvider, reasoningEnabled } = get();
    if (!currentConversationId || !content.trim()) return;
    const currentConversation = get().currentConversation();
    const runtimeModel =
      selectedProvider === "ollama"
        ? selectedModel
        : resolveRuntimeModelId(
            selectedProvider as Provider,
            selectedModel,
            get().allModelsRaw(),
            reasoningEnabled
          );

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: currentConversationId,
      role: "user",
      content: content.trim(),
      created_at: new Date().toISOString(),
      used_web: false,
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [currentConversationId]: [...(s.messages[currentConversationId] ?? []), userMsg],
      },
      toolStatusByConversation: {
        ...s.toolStatusByConversation,
        [currentConversationId]: undefined,
      },
      modelDebugByConversation: {
        ...s.modelDebugByConversation,
        [currentConversationId]: {
          provider: selectedProvider,
          requested_model: runtimeModel,
        },
      },
      isStreaming: true,
      streamingContent: "",
      streamingConversationId: currentConversationId,
    }));

    try {
      if (
        !currentConversation ||
        currentConversation.model !== runtimeModel ||
        currentConversation.provider !== selectedProvider
      ) {
        await invoke("set_conversation_model_provider", {
          conversationId: currentConversationId,
          model: runtimeModel,
          provider: selectedProvider,
        });
      }

      await invoke("send_message", {
        conversationId: currentConversationId,
        content: content.trim(),
        model: runtimeModel,
        provider: selectedProvider,
      });
    } catch (error) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        conversation_id: currentConversationId,
        role: "assistant",
        content: `**Error:** ${error instanceof Error ? error.message : String(error)}`,
        created_at: new Date().toISOString(),
        used_web: false,
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [currentConversationId]: [
            ...(s.messages[currentConversationId] ?? []).filter((m) => m.id !== "__streaming__"),
            errMsg,
          ],
        },
        toolStatusByConversation: {
          ...s.toolStatusByConversation,
          [currentConversationId]: undefined,
        },
        isStreaming: false,
        streamingContent: "",
        streamingConversationId: null,
      }));
    }
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  saveSettings: async (partial) => {
    const previous = get().settings;
    const merged = { ...previous, ...partial };
    set({ settings: merged });
    try {
      await invoke("save_settings", { settings: merged });
    } catch (error) {
      set({ settings: previous });
      throw error;
    }
    // Refresh Ollama if URL changed
    if (partial.ollama_url !== undefined) {
      await get().refreshOllamaRuntime().catch((e) => {
        console.error("Failed to refresh Ollama runtime after URL change:", e);
        set({ ollamaOnline: false });
      });
      if (get().ollamaOnline) {
        await get().refreshOllamaModels().catch((e) => {
          console.error("Failed to refresh Ollama models after URL change:", e);
          set({ ollamaModels: [] });
        });
      } else {
        set({ ollamaModels: [] });
      }
    }

    if (partial.xai_api_key !== undefined) {
      if (merged.xai_api_key) {
        await get().refreshXaiModels().catch((e) => {
          console.error("Failed to refresh xAI models after key change:", e);
          set({ xaiModels: [] });
        });
      } else {
        set({ xaiModels: [] });
      }
    }

    if (partial.openai_api_key !== undefined) {
      if (merged.openai_api_key) {
        await get().refreshOpenAIModels().catch((e) => {
          console.error("Failed to refresh OpenAI models after key change:", e);
          set({ openaiModels: [] });
        });
      } else {
        set({ openaiModels: [] });
      }
    }
  },

  sendImageMessage: async (content) => {
    const { currentConversationId, selectedModel, selectedProvider } = get();
    if (!currentConversationId || !content.trim()) return;
    const currentConversation = get().currentConversation();

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: currentConversationId,
      role: "user",
      content: content.trim(),
      created_at: new Date().toISOString(),
      used_web: false,
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [currentConversationId]: [...(s.messages[currentConversationId] ?? []), userMsg],
      },
      toolStatusByConversation: {
        ...s.toolStatusByConversation,
        [currentConversationId]: undefined,
      },
      modelDebugByConversation: {
        ...s.modelDebugByConversation,
        [currentConversationId]: {
          provider: selectedProvider,
          requested_model: "image-generation",
        },
      },
      isStreaming: true,
      streamingContent: "",
      streamingConversationId: currentConversationId,
    }));

    try {
      if (
        !currentConversation ||
        currentConversation.model !== selectedModel ||
        currentConversation.provider !== selectedProvider
      ) {
        await invoke("set_conversation_model_provider", {
          conversationId: currentConversationId,
          model: selectedModel,
          provider: selectedProvider,
        });
      }

      await invoke("send_image_message", {
        conversationId: currentConversationId,
        prompt: content.trim(),
        model: selectedModel,
        provider: selectedProvider,
      });

      const msgs = await invoke<Message[]>("get_messages", { conversationId: currentConversationId });
      set((s) => ({
        messages: { ...s.messages, [currentConversationId]: msgs },
        toolStatusByConversation: {
          ...s.toolStatusByConversation,
          [currentConversationId]: undefined,
        },
        isStreaming: false,
        streamingContent: "",
        streamingConversationId: null,
      }));
      await get().loadConversations();
    } catch (error) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        conversation_id: currentConversationId,
        role: "assistant",
        content: `**Error:** ${error instanceof Error ? error.message : String(error)}`,
        created_at: new Date().toISOString(),
        used_web: false,
      };
      set((s) => ({
        messages: {
          ...s.messages,
          [currentConversationId]: [
            ...(s.messages[currentConversationId] ?? []).filter((m) => m.id !== "__streaming__"),
            errMsg,
          ],
        },
        toolStatusByConversation: {
          ...s.toolStatusByConversation,
          [currentConversationId]: undefined,
        },
        isStreaming: false,
        streamingContent: "",
        streamingConversationId: null,
      }));
    }
  },

  stopStreaming: async () => {
    const { currentConversationId, isStreaming, streamingConversationId } = get();
    if (!isStreaming || !streamingConversationId) {
      return;
    }

    const targetConversationId = streamingConversationId ?? currentConversationId;
    try {
      await invoke("cancel_stream", { conversationId: targetConversationId });
    } catch (error) {
      console.error("Failed to cancel stream:", error);
    } finally {
      set((s) => ({
        toolStatusByConversation: {
          ...s.toolStatusByConversation,
          [targetConversationId]: undefined,
        },
        isStreaming: false,
        streamingContent: "",
        streamingConversationId: null,
      }));
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

  importLocalGgufModel: async (modelName, ggufPath) => {
    await invoke("import_local_gguf_model", { modelName, ggufPath });
    await get().refreshOllamaModels();
  },

  listHfGgufFiles: async (repoId, hfToken) =>
    invoke<HfGgufFile[]>("list_hf_gguf_files", {
      repoId,
      hfToken: hfToken?.trim() ? hfToken.trim() : null,
    }),

  searchHfModels: async (query, options) =>
    invoke<HfModelSearchResult[]>("search_hf_models", {
      query,
      hfToken: options?.hfToken?.trim() ? options.hfToken.trim() : null,
      limit: options?.limit ?? 30,
    }),

  downloadHfAndImportModel: async ({ repoId, fileName, modelName, revision, hfToken }) => {
    await invoke("download_hf_and_import_model", {
      repoId,
      fileName,
      modelName,
      revision: revision?.trim() ? revision.trim() : null,
      hfToken: hfToken?.trim() ? hfToken.trim() : null,
    });
    await get().refreshOllamaModels();
  },

  // ── Modal toggles ─────────────────────────────────────────────────────────

  setShowSettings: (v) => set({ showSettings: v }),
  setShowAssistants: (v) => set({ showAssistants: v }),

  setSelectedModel: (model, provider) => set({ selectedModel: model, selectedProvider: provider }),
  setReasoningEnabled: (enabled) =>
    set((s) => ({
      reasoningEnabled: enabled,
      imageGenEnabled: enabled ? false : s.imageGenEnabled,
    })),
  setImageGenEnabled: (enabled) =>
    set((s) => ({
      imageGenEnabled: enabled,
      reasoningEnabled: enabled ? false : s.reasoningEnabled,
    })),
}));
