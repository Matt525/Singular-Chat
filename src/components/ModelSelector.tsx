import { Check, ChevronDown, Cpu, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { ModelOption } from "../types";
import { PROVIDER_LABELS } from "../types";

export function ModelSelector() {
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
        className="flex items-center gap-1 text-[#0d0d0d] font-semibold text-base hover:bg-[#f0f0f0] px-2 py-1 rounded-lg transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>Singular Chat</span>
        <ChevronDown
          size={16}
          className={`text-[#6b6b6b] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-[#e5e5e5] rounded-xl shadow-xl w-64 py-2 max-h-96 overflow-y-auto">
          {models.length === 0 && (
            <div className="px-4 py-6 text-center text-[#6b6b6b] text-sm">
              <Cpu size={20} className="mx-auto mb-2 opacity-40" />
              <p className="font-medium text-[#0d0d0d]">No models available</p>
              <p className="text-xs mt-1 text-[#9b9b9b]">
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
                    <Cpu size={11} className="text-[#9b9b9b]" />
                  ) : (
                    <Globe size={11} className="text-[#9b9b9b]" />
                  )}
                  <span className="text-[10px] font-semibold text-[#9b9b9b] uppercase tracking-wider">
                    {PROVIDER_LABELS[provider]}
                  </span>
                </div>
                {items.map((model) => (
                  <button
                    key={model.id}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm text-[#0d0d0d] hover:bg-[#f5f5f5] transition-colors"
                    onClick={() => {
                      setSelectedModel(model.id, model.provider);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{model.name}</span>
                      {model.description && (
                        <span className="text-xs text-[#9b9b9b]">{model.description}</span>
                      )}
                    </div>
                    {model.id === selectedModel && (
                      <Check size={14} className="text-[#0d0d0d] shrink-0" />
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
