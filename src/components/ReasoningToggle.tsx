import { BrainCircuit } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useShallow } from "zustand/react/shallow";

function familyKey(modelId: string): string {
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

function isReasoningModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.includes("non-reasoning") || lower.includes("non_reasoning")) {
    return false;
  }
  return (
    lower.includes("reasoning") || lower.includes("reasoner") || lower.includes("thinking")
  );
}

export function ReasoningToggle() {
  const {
    reasoningEnabled,
    setReasoningEnabled,
    selectedModel,
    selectedProvider,
    allModelsRaw,
  } =
    useAppStore(
      useShallow((state) => ({
        reasoningEnabled: state.reasoningEnabled,
        setReasoningEnabled: state.setReasoningEnabled,
        selectedModel: state.selectedModel,
        selectedProvider: state.selectedProvider,
        allModelsRaw: state.allModelsRaw,
      }))
    );

  const hasReasoningVariant = allModelsRaw()
    .filter((m) => m.provider === selectedProvider)
    .some((m) => familyKey(m.id) === familyKey(selectedModel) && isReasoningModelId(m.id));

  return (
    <button
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs font-medium"
      style={{
        background: reasoningEnabled ? "var(--bg-sidebar-active)" : "transparent",
        borderColor: reasoningEnabled ? "var(--border-strong)" : "var(--border-subtle)",
        color: reasoningEnabled ? "var(--text-primary)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (!reasoningEnabled) {
          e.currentTarget.style.background = "var(--bg-sidebar-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!reasoningEnabled) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
      onClick={() => setReasoningEnabled(!reasoningEnabled)}
      title={
        hasReasoningVariant
          ? "Auto-switch to a reasoning variant when available"
          : "Reasoning toggle is on, but no reasoning variant was detected for this model family"
      }
    >
      <BrainCircuit size={14} />
      <span>{reasoningEnabled ? "Reason On" : "Reason"}</span>
    </button>
  );
}
