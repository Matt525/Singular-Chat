export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  assistant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  used_web: boolean;
}

export interface Assistant {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  provider: string;
  avatar_color: string;
  created_at: string;
}

export interface Settings {
  openai_api_key: string;
  anthropic_api_key: string;
  groq_api_key: string;
  xai_api_key: string;
  default_model: string;
  default_provider: string;
  ollama_url: string;
  theme: AppTheme;
  show_full_model_picker: boolean;
  web_search_enabled: boolean;
}

export const APP_THEMES = ["dark", "light", "midnight"] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: "ollama" | "openai" | "anthropic" | "groq" | "xai";
  description?: string;
}

export interface StreamChunk {
  conversation_id: string;
  chunk: string;
  done: boolean;
}

export interface OllamaRuntimeStatus {
  installed: boolean;
  running: boolean;
  local_version?: string;
  latest_version?: string;
  update_available: boolean;
  platform: string;
}

export interface ModelDebugEvent {
  conversation_id: string;
  phase: "request" | "response";
  provider?: string;
  requested_model?: string;
  response_model?: string;
}

export interface ToolStatusEvent {
  conversation_id: string;
  status: string;
  active: boolean;
}

export interface ModelPullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
}

export interface LocalModelImportProgress {
  stage: "download" | "import";
  model: string;
  status: string;
  completed?: number;
  total?: number;
}

export interface HfGgufFile {
  name: string;
  size?: number;
}

export interface HfModelSearchResult {
  id: string;
  downloads?: number;
  likes?: number;
  last_modified?: string;
  pipeline_tag?: string;
  private: boolean;
  gated: boolean;
}

export type Provider = "ollama" | "openai" | "anthropic" | "groq" | "xai";

export const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "Local (Ollama)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  xai: "xAI (Grok)",
};

export const STATIC_MODELS: ModelOption[] = [
  // OpenAI
  { id: "gpt-5.4", name: "GPT-5.4", provider: "openai", description: "Latest flagship OpenAI model" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", provider: "openai", description: "Fast, lower-cost OpenAI model" },
  { id: "gpt-5.4-nano", name: "GPT-5.4 nano", provider: "openai", description: "Fastest, lowest-cost OpenAI model" },
  { id: "gpt-5-pro", name: "GPT-5 pro", provider: "openai", description: "High-precision OpenAI reasoning model" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", description: "Strong general-purpose model" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 mini", provider: "openai", description: "Smaller GPT-4.1 variant" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 nano", provider: "openai", description: "Smallest GPT-4.1 variant" },
  { id: "o3-pro", name: "o3 pro", provider: "openai", description: "High-compute reasoning model" },
  { id: "o4-mini", name: "o4 mini", provider: "openai", description: "Efficient reasoning model" },
  { id: "o3", name: "o3", provider: "openai", description: "Reasoning model" },
  { id: "o3-mini", name: "o3 mini", provider: "openai", description: "Smaller reasoning model" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", description: "Previous flagship model" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", description: "Compact GPT-4o variant" },
  // Anthropic
  { id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "anthropic", description: "Most powerful Claude" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic", description: "Balanced performance" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", description: "Fastest Claude" },
  // Groq
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "groq", description: "Fast inference via Groq" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", provider: "groq", description: "Ultra-fast Llama" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", provider: "groq", description: "Mixture of experts" },
  { id: "gemma2-9b-it", name: "Gemma 2 9B", provider: "groq", description: "Google's Gemma via Groq" },
  // xAI (Grok)
  { id: "grok-4.20-beta-latest-non-reasoning", name: "Grok 4.20 (Non-Reasoning)", provider: "xai", description: "Latest Grok 4.20 API model" },
  { id: "grok-4.20-reasoning", name: "Grok 4.20 (Reasoning)", provider: "xai", description: "Reasoning-capable Grok 4.20 model" },
  { id: "grok-4.20-multi-agent", name: "Grok 4.20 Multi-Agent", provider: "xai", description: "Agentic research-oriented Grok 4.20 variant" },
  { id: "grok-4", name: "Grok 4", provider: "xai", description: "Flagship Grok 4 model" },
  { id: "grok-3", name: "Grok 3", provider: "xai", description: "Strong reasoning and coding" },
  { id: "grok-3-mini", name: "Grok 3 Mini", provider: "xai", description: "Lower-latency Grok 3 variant" },
];

export const POPULAR_OLLAMA_MODELS = [
  { name: "gpt-oss:20b", description: "OpenAI gpt-oss 20B", size: "20B params" },
  { name: "llama3.3", description: "Meta Llama 3.3", size: "latest tag" },
  { name: "qwen3:30b", description: "Qwen 3 30B", size: "30B params" },
  { name: "qwen3-coder:30b", description: "Qwen 3 Coder 30B", size: "30B params" },
  { name: "deepseek-r1", description: "DeepSeek R1 distilled", size: "latest tag" },
  { name: "gemma3", description: "Google Gemma 3", size: "latest tag" },
  { name: "gemma3n", description: "Google Gemma 3n", size: "latest tag" },
  { name: "mistral-small3.1", description: "Mistral Small 3.1", size: "24B family" },
  { name: "mistral-small", description: "Mistral Small 3", size: "24B params" },
  { name: "phi4", description: "Microsoft Phi-4", size: "14B params" },
  { name: "llama3.2", description: "Meta Llama 3.2", size: "latest tag" },
  { name: "nomic-embed-text", description: "Nomic text embeddings", size: "embedding" },
];

export const AVATAR_COLORS = [
  "#10a37f", "#7c3aed", "#db2777", "#2563eb",
  "#d97706", "#dc2626", "#059669", "#0ea5e9",
];
