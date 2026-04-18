import { Check, ChevronLeft, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { Assistant } from "../types";
import { AVATAR_COLORS, PROVIDER_LABELS } from "../types";
import { useShallow } from "zustand/react/shallow";

interface AssistantFormProps {
  initial?: Partial<Assistant>;
  onSave: (data: Omit<Assistant, "id" | "created_at">) => void;
  onCancel: () => void;
}

function AssistantForm({ initial, onSave, onCancel }: AssistantFormProps) {
  const { settings, ollamaModels, openaiModels, xaiModels, allModelsRaw } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      ollamaModels: state.ollamaModels,
      openaiModels: state.openaiModels,
      xaiModels: state.xaiModels,
      allModelsRaw: state.allModelsRaw,
    }))
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "");
  const [model, setModel] = useState(initial?.model ?? "llama3.2");
  const [provider, setProvider] = useState(initial?.provider ?? "ollama");
  const [avatarColor, setAvatarColor] = useState(initial?.avatar_color ?? AVATAR_COLORS[0]);
  const nameId = useId();
  const descriptionId = useId();
  const systemPromptId = useId();
  const modelId = useId();

  const models = useMemo(
    () => allModelsRaw(),
    [allModelsRaw, settings, ollamaModels, openaiModels, xaiModels]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" className="p-1.5 text-[#9b9b9b] hover:text-[#0d0d0d] hover:bg-[#f4f4f4] rounded-lg transition-colors" onClick={onCancel}>
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-base font-semibold text-[#0d0d0d]">
          {initial?.id ? "Edit Assistant" : "Create Assistant"}
        </h3>
      </div>

      <div className="space-y-5 flex-1 overflow-y-auto">
        {/* Avatar */}
        <div>
          <label className="block text-sm text-[#6b6b6b] mb-2">Color</label>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold"
              style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}aa)` }}>
              {name ? name[0].toUpperCase() : "?"}
            </div>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_COLORS.map((c) => (
                <button key={c} type="button" className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: avatarColor === c ? "#0d0d0d" : "transparent", transform: avatarColor === c ? "scale(1.15)" : "scale(1)" }}
                  onClick={() => setAvatarColor(c)} />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor={nameId} className="block text-sm text-[#6b6b6b] mb-1.5">Name *</label>
          <input id={nameId} className="w-full bg-white border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0] placeholder-[#b0b0b0]"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Code Reviewer" />
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-sm text-[#6b6b6b] mb-1.5">Description</label>
          <input id={descriptionId} className="w-full bg-white border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0] placeholder-[#b0b0b0]"
            value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this assistant do?" />
        </div>

        <div>
          <label htmlFor={systemPromptId} className="block text-sm text-[#6b6b6b] mb-1.5">System Prompt *</label>
          <textarea id={systemPromptId} className="w-full bg-white border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0] placeholder-[#b0b0b0] resize-none"
            rows={5} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful assistant that..." />
          <p className="text-xs text-[#b0b0b0] mt-1">Prepended to every conversation with this assistant.</p>
        </div>

        <div>
          <label htmlFor={modelId} className="block text-sm text-[#6b6b6b] mb-1.5">Default Model</label>
          <select id={modelId} className="w-full bg-white border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0]"
            value={`${provider}::${model}`}
            onChange={(e) => { const [p, m] = e.target.value.split("::"); setProvider(p); setModel(m); }}>
            {models.length === 0 && <option value="ollama::llama3.2">llama3.2 (Ollama)</option>}
            {(["ollama", "openai", "anthropic", "groq", "xai"] as const).map((p) => {
              const items = models.filter((m) => m.provider === p);
              if (!items.length) return null;
              return (
                <optgroup key={p} label={PROVIDER_LABELS[p]}>
                  {items.map((m) => <option key={m.id} value={`${p}::${m.id}`}>{m.name}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-[#e5e5e5] mt-4 shrink-0">
        <button type="button" className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#0d0d0d] hover:bg-[#f4f4f4] rounded-xl transition-colors" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 bg-[#0d0d0d] hover:bg-[#2d2d2d] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          disabled={!name.trim() || !systemPrompt.trim()}
          onClick={() => { if (name.trim() && systemPrompt.trim()) onSave({ name, description, system_prompt: systemPrompt, model, provider, avatar_color: avatarColor }); }}
        >
          <Check size={14} />
          {initial?.id ? "Save Changes" : "Create"}
        </button>
      </div>
    </div>
  );
}

function AssistantCard({ assistant, onEdit, onDelete, onChat }: {
  assistant: Assistant; onEdit: () => void; onDelete: () => void; onChat: () => void;
}) {
  return (
    <div
      className="group flex flex-col gap-3 p-4 bg-white hover:bg-[#f9f9f9] rounded-2xl border border-[#e5e5e5] hover:border-[#d1d1d1] transition-all cursor-pointer"
      onClick={() => {
        void Promise.resolve()
          .then(() => onChat())
          .catch(console.error);
      }}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
          style={{ background: `linear-gradient(135deg, ${assistant.avatar_color}, ${assistant.avatar_color}aa)` }}>
          {assistant.name[0].toUpperCase()}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="p-1.5 text-[#9b9b9b] hover:text-[#0d0d0d] hover:bg-[#f0f0f0] rounded-lg transition-colors"
            aria-label="Edit assistant"
            title="Edit assistant"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="p-1.5 text-[#9b9b9b] hover:text-red-500 hover:bg-[#f0f0f0] rounded-lg transition-colors"
            aria-label="Delete assistant"
            title="Delete assistant"
            onClick={(e) => {
              e.stopPropagation();
              void Promise.resolve()
                .then(() => onDelete())
                .catch(console.error);
            }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0d0d0d]">{assistant.name}</p>
        {assistant.description && <p className="text-xs text-[#9b9b9b] mt-0.5 line-clamp-2">{assistant.description}</p>}
      </div>
      <div className="text-xs text-[#b0b0b0] font-mono">{assistant.model}</div>
    </div>
  );
}

export function AssistantsModal() {
  const { assistants, setShowAssistants, createAssistant, updateAssistant, deleteAssistant, createNewChat } =
    useAppStore(
      useShallow((state) => ({
        assistants: state.assistants,
        setShowAssistants: state.setShowAssistants,
        createAssistant: state.createAssistant,
        updateAssistant: state.updateAssistant,
        deleteAssistant: state.deleteAssistant,
        createNewChat: state.createNewChat,
      }))
    );
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Assistant | null>(null);

  const handleCreate = async (data: Omit<Assistant, "id" | "created_at">) => {
    try {
      await createAssistant(
        data.name,
        data.description,
        data.system_prompt,
        data.model,
        data.provider,
        data.avatar_color
      );
      setView("list");
    } catch (error) {
      console.error("Failed to create assistant:", error);
    }
  };

  const handleUpdate = async (data: Omit<Assistant, "id" | "created_at">) => {
    if (!editing) return;
    try {
      await updateAssistant({ ...editing, ...data });
      setView("list");
      setEditing(null);
    } catch (error) {
      console.error("Failed to update assistant:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white border border-[#e5e5e5] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#0d0d0d]" />
            <h2 className="text-sm font-semibold text-[#0d0d0d]">Assistants</h2>
          </div>
          <div className="flex items-center gap-2">
            {view === "list" && (
              <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d0d0d] hover:bg-[#2d2d2d] text-white rounded-xl text-xs font-medium transition-colors"
                onClick={() => setView("create")}>
                <Plus size={13} /> New Assistant
              </button>
            )}
            <button type="button" className="p-1.5 text-[#9b9b9b] hover:text-[#0d0d0d] hover:bg-[#f4f4f4] rounded-lg transition-colors" onClick={() => setShowAssistants(false)}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {view === "list" && (
            assistants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#f4f4f4] flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-[#9b9b9b]" />
                </div>
                <h3 className="text-base font-semibold text-[#0d0d0d] mb-2">No assistants yet</h3>
                <p className="text-sm text-[#9b9b9b] mb-6 max-w-xs">Create custom assistants with specific personas and instructions.</p>
                <button type="button" className="flex items-center gap-2 px-4 py-2 bg-[#0d0d0d] hover:bg-[#2d2d2d] text-white rounded-xl text-sm font-medium transition-colors"
                  onClick={() => setView("create")}>
                  <Plus size={15} /> Create Your First Assistant
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {assistants.map((a) => (
                  <AssistantCard key={a.id} assistant={a}
                    onEdit={() => { setEditing(a); setView("edit"); }}
                    onDelete={() => deleteAssistant(a.id)}
                    onChat={async () => {
                      try {
                        await createNewChat(a.model, a.provider, a.id);
                        setShowAssistants(false);
                      } catch (error) {
                        console.error("Failed to start assistant chat:", error);
                      }
                    }} />
                ))}
              </div>
            )
          )}
          {view === "create" && <AssistantForm onSave={handleCreate} onCancel={() => setView("list")} />}
          {view === "edit" && editing && (
            <AssistantForm initial={editing} onSave={handleUpdate} onCancel={() => { setView("list"); setEditing(null); }} />
          )}
        </div>
      </div>
    </div>
  );
}
