import { Check, ChevronLeft, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { Assistant } from "../types";
import { AVATAR_COLORS, PROVIDER_LABELS, STATIC_MODELS } from "../types";

interface AssistantFormProps {
  initial?: Partial<Assistant>;
  onSave: (data: Omit<Assistant, "id" | "created_at">) => void;
  onCancel: () => void;
}

function AssistantForm({ initial, onSave, onCancel }: AssistantFormProps) {
  const { settings, ollamaModels, allModels } = useAppStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "");
  const [model, setModel] = useState(initial?.model ?? "llama3.2");
  const [provider, setProvider] = useState(initial?.provider ?? "ollama");
  const [avatarColor, setAvatarColor] = useState(initial?.avatar_color ?? AVATAR_COLORS[0]);

  const models = allModels();

  const handleSave = () => {
    if (!name.trim() || !systemPrompt.trim()) return;
    onSave({ name, description, system_prompt: systemPrompt, model, provider, avatar_color: avatarColor });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <button
          className="p-1.5 text-[#8e8ea0] hover:text-[#ececec] hover:bg-[#2f2f2f] rounded-lg transition-colors"
          onClick={onCancel}
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-base font-semibold text-[#ececec]">
          {initial?.id ? "Edit Assistant" : "Create Assistant"}
        </h3>
      </div>

      <div className="space-y-5 flex-1 overflow-y-auto">
        {/* Avatar color */}
        <div>
          <label className="block text-sm text-[#8e8ea0] mb-2">Avatar Color</label>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow"
              style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}aa)` }}
            >
              {name ? name[0].toUpperCase() : "?"}
            </div>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    background: c,
                    borderColor: avatarColor === c ? "#fff" : "transparent",
                    transform: avatarColor === c ? "scale(1.15)" : "scale(1)",
                  }}
                  onClick={() => setAvatarColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm text-[#8e8ea0] mb-1.5">Name *</label>
          <input
            className="w-full bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2.5 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b] placeholder-[#6b6b6b]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code Reviewer"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm text-[#8e8ea0] mb-1.5">Description</label>
          <input
            className="w-full bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2.5 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b] placeholder-[#6b6b6b]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this assistant does"
          />
        </div>

        {/* System prompt */}
        <div>
          <label className="block text-sm text-[#8e8ea0] mb-1.5">System Prompt *</label>
          <textarea
            className="w-full bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2.5 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b] placeholder-[#6b6b6b] resize-none"
            rows={5}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful assistant that reviews code for bugs, security issues, and best practices. Always explain your reasoning clearly."
          />
          <p className="text-xs text-[#6b6b6b] mt-1">
            This is prepended to every conversation with this assistant.
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm text-[#8e8ea0] mb-1.5">Default Model</label>
          <select
            className="w-full bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2.5 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b]"
            value={`${provider}::${model}`}
            onChange={(e) => {
              const [p, m] = e.target.value.split("::");
              setProvider(p);
              setModel(m);
            }}
          >
            {models.length === 0 && (
              <option value="ollama::llama3.2">llama3.2 (Ollama)</option>
            )}
            {(["ollama", "openai", "anthropic", "groq"] as const).map((p) => {
              const items = models.filter((m) => m.provider === p);
              if (!items.length) return null;
              return (
                <optgroup key={p} label={PROVIDER_LABELS[p]}>
                  {items.map((m) => (
                    <option key={m.id} value={`${p}::${m.id}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-[#2a2a2a] mt-4 shrink-0">
        <button
          className="px-4 py-2 text-sm text-[#8e8ea0] hover:text-[#ececec] hover:bg-[#2f2f2f] rounded-xl transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-[#10a37f] hover:bg-[#1a7f64] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          disabled={!name.trim() || !systemPrompt.trim()}
          onClick={handleSave}
        >
          <Check size={14} />
          {initial?.id ? "Save Changes" : "Create"}
        </button>
      </div>
    </div>
  );
}

interface AssistantCardProps {
  assistant: Assistant;
  onEdit: () => void;
  onDelete: () => void;
  onChat: () => void;
}

function AssistantCard({ assistant, onEdit, onDelete, onChat }: AssistantCardProps) {
  return (
    <div className="group flex flex-col gap-3 p-4 bg-[#2f2f2f] hover:bg-[#353535] rounded-2xl border border-[#3f3f3f] hover:border-[#4a4a4a] transition-all cursor-pointer"
      onClick={onChat}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md"
          style={{
            background: `linear-gradient(135deg, ${assistant.avatar_color}, ${assistant.avatar_color}aa)`,
          }}
        >
          {assistant.name[0].toUpperCase()}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 text-[#8e8ea0] hover:text-[#ececec] hover:bg-[#3f3f3f] rounded-lg transition-colors"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil size={13} />
          </button>
          <button
            className="p-1.5 text-[#8e8ea0] hover:text-red-400 hover:bg-[#3f3f3f] rounded-lg transition-colors"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#ececec]">{assistant.name}</p>
        {assistant.description && (
          <p className="text-xs text-[#8e8ea0] mt-0.5 line-clamp-2">{assistant.description}</p>
        )}
      </div>
      <div className="text-xs text-[#6b6b6b] font-mono">{assistant.model}</div>
    </div>
  );
}

export function AssistantsModal() {
  const {
    assistants,
    setShowAssistants,
    createAssistant,
    updateAssistant,
    deleteAssistant,
    createNewChat,
    selectConversation,
  } = useAppStore();

  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Assistant | null>(null);

  const handleCreate = async (data: Omit<Assistant, "id" | "created_at">) => {
    await createAssistant(
      data.name,
      data.description,
      data.system_prompt,
      data.model,
      data.provider,
      data.avatar_color
    );
    setView("list");
  };

  const handleUpdate = async (data: Omit<Assistant, "id" | "created_at">) => {
    if (!editing) return;
    await updateAssistant({ ...editing, ...data });
    setView("list");
    setEditing(null);
  };

  const handleChat = async (assistant: Assistant) => {
    await createNewChat(assistant.model, assistant.provider, assistant.id);
    setShowAssistants(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#212121] border border-[#3f3f3f] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#10a37f]" />
            <h2 className="text-sm font-semibold text-[#ececec]">Assistants</h2>
          </div>
          <div className="flex items-center gap-2">
            {view === "list" && (
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10a37f] hover:bg-[#1a7f64] text-white rounded-xl text-xs font-medium transition-colors"
                onClick={() => setView("create")}
              >
                <Plus size={13} />
                New Assistant
              </button>
            )}
            <button
              className="p-1.5 text-[#8e8ea0] hover:text-[#ececec] hover:bg-[#2f2f2f] rounded-lg transition-colors"
              onClick={() => setShowAssistants(false)}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === "list" && (
            <>
              {assistants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#2f2f2f] flex items-center justify-center mb-4">
                    <Sparkles size={24} className="text-[#8e8ea0]" />
                  </div>
                  <h3 className="text-base font-semibold text-[#ececec] mb-2">
                    No assistants yet
                  </h3>
                  <p className="text-sm text-[#8e8ea0] mb-6 max-w-xs">
                    Create custom assistants with specific personas, instructions, and model preferences.
                  </p>
                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-[#10a37f] hover:bg-[#1a7f64] text-white rounded-xl text-sm font-medium transition-colors"
                    onClick={() => setView("create")}
                  >
                    <Plus size={15} />
                    Create Your First Assistant
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {assistants.map((a) => (
                    <AssistantCard
                      key={a.id}
                      assistant={a}
                      onEdit={() => { setEditing(a); setView("edit"); }}
                      onDelete={() => deleteAssistant(a.id)}
                      onChat={() => handleChat(a)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {view === "create" && (
            <AssistantForm
              onSave={handleCreate}
              onCancel={() => setView("list")}
            />
          )}

          {view === "edit" && editing && (
            <AssistantForm
              initial={editing}
              onSave={handleUpdate}
              onCancel={() => { setView("list"); setEditing(null); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
