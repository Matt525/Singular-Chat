import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { PROVIDER_LABELS, type ModelOption, type Provider } from "../types";
import { useShallow } from "zustand/react/shallow";

const PROVIDER_ORDER: Provider[] = ["ollama", "openai", "anthropic", "groq", "xai"];

const COLLAPSED_PROVIDER_STATE: Record<Provider, boolean> = {
  ollama: false,
  openai: false,
  anthropic: false,
  groq: false,
  xai: false,
};

function getCompactModelLabel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return "Model";
  }

  const withoutTag = trimmed.includes(":") ? trimmed.split(":")[0] : trimmed;
  const compact = withoutTag
    .replace(/^models?\//i, "")
    .replace(/^meta-llama\//i, "")
    .replace(/^openai\//i, "")
    .replace(/^anthropic\//i, "")
    .replace(/^xai\//i, "")
    .replace(/^groq\//i, "")
    .replace(/[-_]+/g, " ")
    .trim();

  if (compact.length <= 22) {
    return compact;
  }
  return `${compact.slice(0, 22).trimEnd()}...`;
}

function sortModels(models: ModelOption[]) {
  return [...models].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.id.localeCompare(b.id);
  });
}

function groupModelsByProvider(models: ModelOption[]) {
  return PROVIDER_ORDER.map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider],
    models: sortModels(models.filter((model) => model.provider === provider)),
  })).filter((group) => group.models.length > 0);
}

export function ModelSelector() {
  const {
    selectedModel,
    setSelectedModel,
    ollamaOnline,
    settings,
    ollamaModels,
    openaiModels,
    xaiModels,
    allModelsRaw,
    allModels,
  } = useAppStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel,
      ollamaOnline: state.ollamaOnline,
      settings: state.settings,
      ollamaModels: state.ollamaModels,
      openaiModels: state.openaiModels,
      xaiModels: state.xaiModels,
      allModelsRaw: state.allModelsRaw,
      allModels: state.allModels,
    }))
  );
  const [open, setOpen] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState(COLLAPSED_PROVIDER_STATE);
  const ref = useRef<HTMLDivElement>(null);
  const models = useMemo(
    () => (settings.show_full_model_picker ? allModelsRaw() : allModels()),
    [allModels, allModelsRaw, settings.show_full_model_picker, ollamaModels, openaiModels, xaiModels]
  );
  const providerGroups = useMemo(() => groupModelsByProvider(models), [models]);
  const selectedModelOption = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel]
  );
  const headerLabel = getCompactModelLabel(selectedModelOption?.name ?? selectedModel);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-1.5 ui-text-primary font-semibold text-sm px-2.5 py-1.5 rounded-lg transition-colors max-w-[280px]"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-sidebar-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        onClick={() => {
          if (!open) {
            setExpandedProviders(COLLAPSED_PROVIDER_STATE);
          }
          setOpen((v) => !v);
        }}
      >
        <span className="truncate">{headerLabel}</span>
        <ChevronDown
          size={16}
          className={`ui-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 ui-bg-elevated border ui-border rounded-xl shadow-xl w-72 py-2 max-h-96 overflow-y-auto">
          {providerGroups.length === 0 && (
            <div className="px-4 py-6 text-center ui-text-secondary text-sm">
              <p className="font-medium ui-text-primary">No models available</p>
              <p className="text-xs mt-1 ui-text-muted">
                {!ollamaOnline
                  ? "Install Ollama or add API keys in Settings"
                  : "Download a model in Sidebar -> Local models"}
              </p>
            </div>
          )}

          {providerGroups.map(({ provider, label, models: providerModels }) => {
            const expanded = expandedProviders[provider];
            const selectedProvider = selectedModelOption?.provider === provider;
            return (
              <div key={provider} className="px-1.5 py-1">
                <button
                  type="button"
                  className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    selectedProvider ? "ui-text-primary" : "ui-text-secondary"
                  }`}
                  style={{
                    background: selectedProvider ? "var(--bg-sidebar-hover)" : "transparent",
                  }}
                  aria-expanded={expanded}
                  aria-controls={`provider-${provider}-models`}
                  onClick={() =>
                    setExpandedProviders((current) => ({
                      ...current,
                      [provider]: !current[provider],
                    }))
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate text-left">{label}</span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] ui-text-muted ui-bg-input">
                      {providerModels.length}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`ui-text-secondary transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>

                {expanded && (
                  <div id={`provider-${provider}-models`} className="mt-1 space-y-1">
                    {providerModels.map((model) => (
                      <button
                        type="button"
                        key={model.id}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm ui-text-primary transition-colors rounded-lg"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                        onClick={() => {
                          setSelectedModel(model.id, model.provider);
                          setOpen(false);
                        }}
                      >
                        <span className="font-medium truncate text-left">{model.name}</span>
                        {model.id === selectedModel && (
                          <Check size={14} className="ui-text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
