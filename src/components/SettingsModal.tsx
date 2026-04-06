import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
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
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm text-[#8e8ea0] mb-1.5">{label}</label>
      <div className="flex items-center gap-2 bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2.5 focus-within:border-[#6b6b6b]">
        <input
          type={show ? "text" : "password"}
          className="flex-1 bg-transparent text-[#ececec] text-sm outline-none placeholder-[#6b6b6b]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "sk-…"}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="text-[#8e8ea0] hover:text-[#ececec] transition-colors"
          onClick={() => setShow(!show)}
        >
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
        <h3 className="text-sm font-semibold text-[#ececec] mb-4">Appearance</h3>
        <div className="flex items-center justify-between p-3 bg-[#171717] rounded-xl border border-[#3f3f3f]">
          <span className="text-sm text-[#ececec]">Theme</span>
          <select
            className="bg-[#2f2f2f] text-[#ececec] text-sm rounded-lg px-3 py-1.5 border border-[#3f3f3f] outline-none"
            value={settings.theme}
            onChange={(e) => saveSettings({ theme: e.target.value })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#ececec] mb-1">Default Model</h3>
        <p className="text-xs text-[#8e8ea0] mb-3">Used when starting new conversations</p>
        <div className="flex items-center gap-3">
          <input
            className="flex-1 bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2.5 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b]"
            value={settings.default_model}
            onChange={(e) => saveSettings({ default_model: e.target.value })}
            placeholder="e.g. llama3.2"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#ececec] mb-1">About</h3>
        <div className="p-4 bg-[#171717] rounded-xl border border-[#3f3f3f] text-sm text-[#8e8ea0] space-y-1">
          <p><span className="text-[#ececec]">Singular Chat</span> — v0.1.0</p>
          <p>Open-source, privacy-first desktop chat</p>
          <p>Data stored locally on your device</p>
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
      <p className="text-sm text-[#8e8ea0]">
        API keys are stored locally on your device and never sent to any server other than the respective AI provider.
      </p>

      <ApiKeyInput
        label="OpenAI API Key"
        value={local.openai_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, openai_api_key: v }))}
        placeholder="sk-…"
      />
      <ApiKeyInput
        label="Anthropic API Key"
        value={local.anthropic_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, anthropic_api_key: v }))}
        placeholder="sk-ant-…"
      />
      <ApiKeyInput
        label="Groq API Key"
        value={local.groq_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, groq_api_key: v }))}
        placeholder="gsk_…"
      />

      <button
        className="flex items-center gap-2 px-4 py-2 bg-[#10a37f] hover:bg-[#1a7f64] text-white rounded-xl text-sm font-medium transition-colors"
        onClick={handleSave}
      >
        {saved ? <CheckCircle2 size={15} /> : null}
        {saved ? "Saved!" : "Save API Keys"}
      </button>
    </div>
  );
}

interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
}

function LocalModelsTab() {
  const { settings, saveSettings, ollamaModels, ollamaOnline, refreshOllamaModels, pullOllamaModel, deleteOllamaModel } =
    useAppStore();
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollama_url);
  const [urlSaved, setUrlSaved] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    listen<ModelPullProgress>("model-pull-progress", (e) => {
      setPullProgress({
        status: e.payload.status,
        completed: e.payload.completed,
        total: e.payload.total,
      });
    }).then((fn) => {
      unlistenRef.current = fn;
    });
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const handleSaveUrl = async () => {
    await saveSettings({ ollama_url: ollamaUrl });
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

  const handlePull = async (name: string) => {
    setPulling(name);
    setPullProgress(null);
    try {
      await pullOllamaModel(name);
    } catch (e) {
      console.error(e);
    } finally {
      setPulling(null);
      setPullProgress(null);
    }
  };

  const handleDelete = async (name: string) => {
    setDeleting(name);
    try {
      await deleteOllamaModel(name);
    } finally {
      setDeleting(null);
    }
  };

  const downloadedNames = new Set(ollamaModels.map((m) => m.name));

  const progressPercent =
    pullProgress?.total && pullProgress.completed
      ? Math.round((pullProgress.completed / pullProgress.total) * 100)
      : null;

  return (
    <div className="space-y-6">
      {/* Ollama connection */}
      <div>
        <h3 className="text-sm font-semibold text-[#ececec] mb-1">Ollama Server</h3>
        <p className="text-xs text-[#8e8ea0] mb-3">
          Ollama runs local models on your machine.{" "}
          <a
            href="https://ollama.com"
            className="text-[#10a37f] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install Ollama →
          </a>
        </p>

        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${ollamaOnline ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-[#8e8ea0]">
            {ollamaOnline ? "Connected" : "Not running"}
          </span>
          <button
            className="ml-auto text-xs text-[#10a37f] hover:underline"
            onClick={refreshOllamaModels}
          >
            Refresh
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b]"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
          <button
            className="px-3 py-2 bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#3f3f3f] rounded-xl text-sm text-[#ececec] transition-colors"
            onClick={handleSaveUrl}
          >
            {urlSaved ? <CheckCircle2 size={14} className="text-green-500" /> : "Save"}
          </button>
        </div>
      </div>

      {/* Downloaded models */}
      {ollamaModels.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#ececec] mb-3">
            Downloaded Models ({ollamaModels.length})
          </h3>
          <div className="space-y-2">
            {ollamaModels.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between p-3 bg-[#171717] rounded-xl border border-[#3f3f3f]"
              >
                <div>
                  <p className="text-sm text-[#ececec]">{m.name}</p>
                  <p className="text-xs text-[#8e8ea0]">{(m.size / 1e9).toFixed(1)} GB</p>
                </div>
                <button
                  className="p-1.5 text-[#8e8ea0] hover:text-red-400 transition-colors"
                  onClick={() => handleDelete(m.name)}
                  disabled={deleting === m.name}
                >
                  {deleting === m.name ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pull progress */}
      {pulling && pullProgress && (
        <div className="p-3 bg-[#171717] rounded-xl border border-[#3f3f3f]">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin text-[#10a37f]" />
            <span className="text-sm text-[#ececec]">
              Downloading {pulling}…
            </span>
          </div>
          <p className="text-xs text-[#8e8ea0] mb-1">{pullProgress.status}</p>
          {progressPercent !== null && (
            <div className="w-full bg-[#3f3f3f] rounded-full h-1.5">
              <div
                className="bg-[#10a37f] h-1.5 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Custom model pull */}
      <div>
        <h3 className="text-sm font-semibold text-[#ececec] mb-1">Download a Model</h3>
        <p className="text-xs text-[#8e8ea0] mb-3">
          Enter any model name from{" "}
          <a
            href="https://ollama.com/library"
            className="text-[#10a37f] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            ollama.com/library
          </a>
        </p>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-[#171717] border border-[#3f3f3f] rounded-xl px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#6b6b6b] placeholder-[#6b6b6b]"
            placeholder="e.g. llama3.2, gemma2:9b"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customModel.trim()) handlePull(customModel.trim());
            }}
          />
          <button
            className="flex items-center gap-1.5 px-3 py-2 bg-[#10a37f] hover:bg-[#1a7f64] text-white rounded-xl text-sm transition-colors disabled:opacity-50"
            disabled={!customModel.trim() || !!pulling}
            onClick={() => handlePull(customModel.trim())}
          >
            <Download size={14} />
            Pull
          </button>
        </div>

        {/* Popular models list */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {POPULAR_OLLAMA_MODELS.map((m) => {
            const downloaded = downloadedNames.has(m.name);
            const isPulling = pulling === m.name;
            return (
              <div
                key={m.name}
                className="flex items-center justify-between p-3 bg-[#171717] hover:bg-[#1e1e1e] rounded-xl border border-[#3f3f3f] transition-colors"
              >
                <div>
                  <p className="text-sm text-[#ececec] font-medium">{m.name}</p>
                  <p className="text-xs text-[#8e8ea0]">
                    {m.description} · {m.size}
                  </p>
                </div>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    downloaded
                      ? "bg-[#2f2f2f] text-[#8e8ea0] cursor-default"
                      : isPulling
                      ? "bg-[#2f2f2f] text-[#10a37f] cursor-default"
                      : "bg-[#10a37f]/20 text-[#10a37f] hover:bg-[#10a37f]/30"
                  }`}
                  disabled={downloaded || isPulling || !!pulling}
                  onClick={() => handlePull(m.name)}
                >
                  {downloaded ? (
                    <>
                      <CheckCircle2 size={12} />
                      Downloaded
                    </>
                  ) : isPulling ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download size={12} />
                      Download
                    </>
                  )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#212121] border border-[#3f3f3f] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-[#171717] border-r border-[#2a2a2a] flex flex-col py-4 shrink-0">
          <h2 className="text-sm font-semibold text-[#ececec] px-4 mb-4">Settings</h2>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-[#2f2f2f] text-[#ececec]"
                  : "text-[#8e8ea0] hover:bg-[#2a2a2a] hover:text-[#ececec]"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] shrink-0">
            <h3 className="text-sm font-semibold text-[#ececec]">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              className="p-1.5 text-[#8e8ea0] hover:text-[#ececec] hover:bg-[#2f2f2f] rounded-lg transition-colors"
              onClick={() => setShowSettings(false)}
            >
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
