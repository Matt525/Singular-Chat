import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Server,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { ModelPullProgress } from "../types";
import { POPULAR_OLLAMA_MODELS } from "../types";

type Tab = "general" | "api-keys" | "local-models";

function ApiKeyInput({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm text-[#6b6b6b] mb-1.5">{label}</label>
      <div className="flex items-center gap-2 bg-white border border-[#e5e5e5] rounded-xl px-3 py-2.5 focus-within:border-[#b0b0b0]">
        <input
          type={show ? "text" : "password"}
          className="flex-1 bg-transparent text-[#0d0d0d] text-sm outline-none placeholder-[#b0b0b0]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "sk-…"}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="text-[#9b9b9b] hover:text-[#0d0d0d] transition-colors" onClick={() => setShow(!show)}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function GeneralTab() {
  const { settings, saveSettings } = useAppStore();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-[#0d0d0d] mb-3">Default Model</h3>
        <input
          className="w-full bg-white border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0]"
          value={settings.default_model}
          onChange={(e) => saveSettings({ default_model: e.target.value })}
          placeholder="e.g. llama3.2"
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#0d0d0d] mb-3">About</h3>
        <div className="p-4 bg-[#f9f9f9] rounded-xl border border-[#e5e5e5] text-sm text-[#6b6b6b] space-y-1">
          <p><span className="text-[#0d0d0d] font-medium">Singular Chat</span> — v0.1.0</p>
          <p>Open-source, privacy-first desktop chat</p>
          <p>All data stored locally on your device</p>
        </div>
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const { settings, saveSettings } = useAppStore();
  const [local, setLocal] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await saveSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6b6b6b]">
        API keys are stored locally on your device and sent only to the respective AI provider.
      </p>
      <ApiKeyInput label="OpenAI API Key" value={local.openai_api_key} onChange={(v) => setLocal((s) => ({ ...s, openai_api_key: v }))} placeholder="sk-…" />
      <ApiKeyInput label="Anthropic API Key" value={local.anthropic_api_key} onChange={(v) => setLocal((s) => ({ ...s, anthropic_api_key: v }))} placeholder="sk-ant-…" />
      <ApiKeyInput label="Groq API Key" value={local.groq_api_key} onChange={(v) => setLocal((s) => ({ ...s, groq_api_key: v }))} placeholder="gsk_…" />
      <button
        className="flex items-center gap-2 px-4 py-2 bg-[#0d0d0d] hover:bg-[#2d2d2d] text-white rounded-xl text-sm font-medium transition-colors"
        onClick={handleSave}
      >
        {saved ? <CheckCircle2 size={15} /> : null}
        {saved ? "Saved!" : "Save API Keys"}
      </button>
    </div>
  );
}

function LocalModelsTab() {
  const { settings, saveSettings, ollamaModels, ollamaOnline, refreshOllamaModels, pullOllamaModel, deleteOllamaModel } = useAppStore();
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollama_url);
  const [urlSaved, setUrlSaved] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    listen<ModelPullProgress>("model-pull-progress", (e) => {
      setPullProgress({ status: e.payload.status, completed: e.payload.completed, total: e.payload.total });
    }).then((fn) => { unlistenRef.current = fn; });
    return () => { unlistenRef.current?.(); };
  }, []);

  const handlePull = async (name: string) => {
    setPulling(name);
    setPullProgress(null);
    try { await pullOllamaModel(name); } catch (e) { console.error(e); }
    finally { setPulling(null); setPullProgress(null); }
  };

  const handleDelete = async (name: string) => {
    setDeleting(name);
    try { await deleteOllamaModel(name); } finally { setDeleting(null); }
  };

  const downloadedNames = new Set(ollamaModels.map((m) => m.name));
  const progressPercent = pullProgress?.total && pullProgress.completed
    ? Math.round((pullProgress.completed / pullProgress.total) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Ollama status */}
      <div>
        <h3 className="text-sm font-semibold text-[#0d0d0d] mb-1">Ollama Server</h3>
        <p className="text-xs text-[#9b9b9b] mb-3">
          Ollama runs models locally.{" "}
          <a href="https://ollama.com" className="text-[#0d6efd] hover:underline" target="_blank" rel="noopener noreferrer">Install Ollama →</a>
        </p>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${ollamaOnline ? "bg-green-500" : "bg-red-400"}`} />
          <span className="text-sm text-[#6b6b6b]">{ollamaOnline ? "Connected" : "Not running"}</span>
          <button className="ml-auto text-xs text-[#0d6efd] hover:underline" onClick={refreshOllamaModels}>Refresh</button>
        </div>
        <div className="flex gap-2">
          <input className="flex-1 bg-white border border-[#e5e5e5] rounded-xl px-3 py-2 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0]"
            value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" />
          <button className="px-3 py-2 bg-[#f4f4f4] hover:bg-[#ebebeb] border border-[#e5e5e5] rounded-xl text-sm text-[#0d0d0d] transition-colors"
            onClick={async () => { await saveSettings({ ollama_url: ollamaUrl }); setUrlSaved(true); setTimeout(() => setUrlSaved(false), 2000); }}>
            {urlSaved ? <CheckCircle2 size={14} className="text-green-500" /> : "Save"}
          </button>
        </div>
      </div>

      {/* Downloaded models */}
      {ollamaModels.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#0d0d0d] mb-3">Downloaded ({ollamaModels.length})</h3>
          <div className="space-y-2">
            {ollamaModels.map((m) => (
              <div key={m.name} className="flex items-center justify-between p-3 bg-[#f9f9f9] rounded-xl border border-[#e5e5e5]">
                <div>
                  <p className="text-sm font-medium text-[#0d0d0d]">{m.name}</p>
                  <p className="text-xs text-[#9b9b9b]">{(m.size / 1e9).toFixed(1)} GB</p>
                </div>
                <button className="p-1.5 text-[#9b9b9b] hover:text-red-500 transition-colors" onClick={() => handleDelete(m.name)} disabled={deleting === m.name}>
                  {deleting === m.name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pull progress */}
      {pulling && pullProgress && (
        <div className="p-3 bg-[#f9f9f9] rounded-xl border border-[#e5e5e5]">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin text-[#0d0d0d]" />
            <span className="text-sm text-[#0d0d0d]">Downloading {pulling}…</span>
          </div>
          <p className="text-xs text-[#9b9b9b] mb-1">{pullProgress.status}</p>
          {progressPercent !== null && (
            <div className="w-full bg-[#e5e5e5] rounded-full h-1.5">
              <div className="bg-[#0d0d0d] h-1.5 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Custom pull */}
      <div>
        <h3 className="text-sm font-semibold text-[#0d0d0d] mb-1">Download a Model</h3>
        <p className="text-xs text-[#9b9b9b] mb-3">
          Any model from <a href="https://ollama.com/library" className="text-[#0d6efd] hover:underline" target="_blank" rel="noopener noreferrer">ollama.com/library</a>
        </p>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-white border border-[#e5e5e5] rounded-xl px-3 py-2 text-sm text-[#0d0d0d] outline-none focus:border-[#b0b0b0] placeholder-[#b0b0b0]"
            placeholder="e.g. llama3.2, gemma2:9b"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && customModel.trim()) handlePull(customModel.trim()); }}
          />
          <button
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0d0d0d] hover:bg-[#2d2d2d] text-white rounded-xl text-sm transition-colors disabled:opacity-40"
            disabled={!customModel.trim() || !!pulling}
            onClick={() => handlePull(customModel.trim())}
          >
            <Download size={14} /> Pull
          </button>
        </div>

        {/* Popular models */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {POPULAR_OLLAMA_MODELS.map((m) => {
            const downloaded = downloadedNames.has(m.name);
            const isPulling = pulling === m.name;
            return (
              <div key={m.name} className="flex items-center justify-between p-3 bg-white hover:bg-[#f9f9f9] rounded-xl border border-[#e5e5e5] transition-colors">
                <div>
                  <p className="text-sm font-medium text-[#0d0d0d]">{m.name}</p>
                  <p className="text-xs text-[#9b9b9b]">{m.description} · {m.size}</p>
                </div>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    downloaded ? "bg-[#f4f4f4] text-[#9b9b9b] cursor-default"
                    : isPulling ? "bg-[#f4f4f4] text-[#0d0d0d] cursor-default"
                    : "bg-[#0d0d0d] text-white hover:bg-[#2d2d2d]"
                  }`}
                  disabled={downloaded || isPulling || !!pulling}
                  onClick={() => handlePull(m.name)}
                >
                  {downloaded ? <><CheckCircle2 size={12} /> Downloaded</>
                  : isPulling ? <><Loader2 size={12} className="animate-spin" /> Downloading…</>
                  : <><Download size={12} /> Download</>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings size={15} /> },
  { id: "api-keys", label: "API Keys", icon: <Key size={15} /> },
  { id: "local-models", label: "Local Models", icon: <Server size={15} /> },
];

export function SettingsModal() {
  const { setShowSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white border border-[#e5e5e5] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col py-4 shrink-0">
          <h2 className="text-sm font-semibold text-[#0d0d0d] px-4 mb-4">Settings</h2>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                activeTab === tab.id ? "bg-[#ebebeb] text-[#0d0d0d]" : "text-[#6b6b6b] hover:bg-[#f0f0f0] hover:text-[#0d0d0d]"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5] shrink-0">
            <h3 className="text-sm font-semibold text-[#0d0d0d]">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button className="p-1.5 text-[#9b9b9b] hover:text-[#0d0d0d] hover:bg-[#f4f4f4] rounded-lg transition-colors" onClick={() => setShowSettings(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "general" && <GeneralTab />}
            {activeTab === "api-keys" && <ApiKeysTab />}
            {activeTab === "local-models" && <LocalModelsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
