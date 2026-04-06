import { Check, ChevronDown, Cpu, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { ModelOption } from "../types";
import { PROVIDER_LABELS } from "../types";

interface Props {
  compact?: boolean;
}

export function ModelSelector({ compact = false }: Props) {
  const { selectedModel, selectedProvider, setSelectedModel, allModels, ollamaOnline } =
    useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const models = allModels();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const grouped: Record<string, ModelOption[]> = {};
  for (const m of models) {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  }

  const selectedLabel =
    models.find((m) => m.id === selectedModel)?.name ?? selectedModel;

  const providerOrder = ["ollama", "openai", "anthropic", "groq"] as const;

  return (
    <div className="relative" ref={ref}>
      <button
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-[#ececec] hover:bg-[#2f2f2f] transition-colors ${
          compact ? "text-xs" : ""
        }`}
        onClick={() => setOpen(!open)}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={14} className={`text-[#8e8ea0] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl shadow-2xl w-64 py-2 max-h-96 overflow-y-auto">
          {models.length === 0 && (
            <div className="px-4 py-6 text-center text-[#8e8ea0] text-sm">
              <Cpu size={20} className="mx-auto mb-2 opacity-50" />
              <p>No models available</p>
              <p className="text-xs mt-1">
                {!ollamaOnline
                  ? "Install Ollama or add API keys in Settings"
                  : "Download a model in Settings → Local Models"}
              </p>
            </div>
          )}

          {providerOrder.map((provider) => {
            const items = grouped[provider];
            if (!items?.length) return null;
            return (
              <div key={provider}>
                <div className="flex items-center gap-2 px-3 py-1.5">
                  {provider === "ollama" ? (
                    <Cpu size={11} className="text-[#8e8ea0]" />
                  ) : (
                    <Globe size={11} className="text-[#8e8ea0]" />
                  )}
                  <span className="text-[10px] font-semibold text-[#8e8ea0] uppercase tracking-wider">
                    {PROVIDER_LABELS[provider]}
                  </span>
                </div>
                {items.map((model) => (
                  <button
                    key={model.id}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm text-[#ececec] hover:bg-[#3a3a3a] transition-colors"
                    onClick={() => {
                      setSelectedModel(model.id, model.provider);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col items-start">
                      <span>{model.name}</span>
                      {model.description && (
                        <span className="text-xs text-[#8e8ea0]">{model.description}</span>
                      )}
                    </div>
                    {model.id === selectedModel && (
                      <Check size={14} className="text-[#10a37f] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
