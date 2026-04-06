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
  default_model: string;
  default_provider: string;
  ollama_url: string;
  theme: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: "ollama" | "openai" | "anthropic" | "groq";
  description?: string;
}

export interface StreamChunk {
  conversation_id: string;
  chunk: string;
  done: boolean;
}

export interface ModelPullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
}

export type Provider = "ollama" | "openai" | "anthropic" | "groq";

export const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "Local (Ollama)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
};

export const STATIC_MODELS: ModelOption[] = [
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", description: "Most capable GPT-4 model" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", description: "Fast and affordable" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai", description: "Fast, classic model" },
  // Anthropic
  { id: "claude-opus-4-5", name: "Claude Opus 4.5", provider: "anthropic", description: "Most powerful Claude" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic", description: "Balanced performance" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", description: "Fastest Claude" },
  // Groq
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "groq", description: "Fast inference via Groq" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", provider: "groq", description: "Ultra-fast Llama" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", provider: "groq", description: "Mixture of experts" },
  { id: "gemma2-9b-it", name: "Gemma 2 9B", provider: "groq", description: "Google's Gemma via Groq" },
];

export const POPULAR_OLLAMA_MODELS = [
  { name: "llama3.2", description: "Meta's Llama 3.2 (3B)", size: "~2GB" },
  { name: "llama3.2:1b", description: "Meta's Llama 3.2 (1B)", size: "~800MB" },
  { name: "llama3.1", description: "Meta's Llama 3.1 (8B)", size: "~5GB" },
  { name: "gemma2", description: "Google's Gemma 2 (9B)", size: "~5.5GB" },
  { name: "gemma2:2b", description: "Google's Gemma 2 (2B)", size: "~1.6GB" },
  { name: "mistral", description: "Mistral 7B", size: "~4.1GB" },
  { name: "phi3", description: "Microsoft's Phi-3 (3.8B)", size: "~2.2GB" },
  { name: "phi3:mini", description: "Microsoft's Phi-3 Mini", size: "~1.8GB" },
  { name: "qwen2.5", description: "Alibaba's Qwen 2.5 (7B)", size: "~4.4GB" },
  { name: "deepseek-r1", description: "DeepSeek R1 (7B)", size: "~4.7GB" },
  { name: "codellama", description: "Code Llama (7B)", size: "~3.8GB" },
  { name: "nomic-embed-text", description: "Text Embeddings", size: "~274MB" },
];

export const AVATAR_COLORS = [
  "#10a37f", "#7c3aed", "#db2777", "#2563eb",
  "#d97706", "#dc2626", "#059669", "#7c3aed",
];
