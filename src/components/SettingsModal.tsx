import {
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Moon,
  Palette,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "../stores/appStore";
import { useShallow } from "zustand/react/shallow";

type Tab = "general" | "api-keys";

const THEME_OPTIONS = [
  { id: "dark", label: "Dark", icon: <Moon size={14} /> },
  { id: "light", label: "Light", icon: <Sun size={14} /> },
  { id: "midnight", label: "Midnight", icon: <Palette size={14} /> },
] as const;

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
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm ui-text-secondary mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2 ui-bg-elevated border ui-border rounded-xl px-3 py-2.5">
        <input
          id={inputId}
          type={show ? "text" : "password"}
          className="flex-1 bg-transparent ui-text-primary text-sm outline-none ui-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "sk-..."}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="ui-text-muted ui-hover-text transition-colors"
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function GeneralTab() {
  const { settings, saveSettings } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      saveSettings: state.saveSettings,
    }))
  );
  const [defaultModelDraft, setDefaultModelDraft] = useState(settings.default_model);
  const skipDefaultModelCommitRef = useRef(false);

  useEffect(() => {
    setDefaultModelDraft(settings.default_model);
  }, [settings.default_model]);

  const commitDefaultModel = async () => {
    const nextValue = defaultModelDraft.trim();
    if (!nextValue || nextValue === settings.default_model) {
      setDefaultModelDraft(settings.default_model);
      return;
    }

    try {
      await saveSettings({ default_model: nextValue });
    } catch (error) {
      console.error("Failed to save default model:", error);
      setDefaultModelDraft(settings.default_model);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-3">Color Mode</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((theme) => {
            const selected = settings.theme === theme.id;
            return (
              <button
                type="button"
                key={theme.id}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                  selected
                    ? "ui-bg-input ui-text-primary ui-border-strong"
                    : "ui-bg-elevated ui-text-secondary ui-border ui-hover-text"
                }`}
                onClick={() => void saveSettings({ theme: theme.id }).catch(console.error)}
              >
                {theme.icon}
                {theme.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-3">Default Model</h3>
        <input
          className="w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2.5 text-sm ui-text-primary outline-none ui-input"
          value={defaultModelDraft}
          onChange={(e) => setDefaultModelDraft(e.target.value)}
          placeholder="e.g. llama3.2"
          onBlur={() => {
            if (skipDefaultModelCommitRef.current) {
              skipDefaultModelCommitRef.current = false;
              return;
            }
            void commitDefaultModel().catch(console.error);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitDefaultModel().catch(console.error);
            }
            if (e.key === "Escape") {
              skipDefaultModelCommitRef.current = true;
              setDefaultModelDraft(settings.default_model);
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-2">Model Picker</h3>
        <p className="text-xs ui-text-muted mb-3">
          Clean mode is the default and hides advanced endpoint variants. Turn this on to show the full
          long model list.
        </p>
        <button
          type="button"
          className="flex items-center justify-between w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2.5 text-sm transition-colors"
          onClick={() =>
            void saveSettings({ show_full_model_picker: !settings.show_full_model_picker }).catch(
              console.error
            )
          }
        >
          <span className="ui-text-primary">
            {settings.show_full_model_picker ? "Full list enabled" : "Clean list enabled"}
          </span>
          <span className="ui-text-secondary">
            {settings.show_full_model_picker ? "Switch to clean" : "Switch to full"}
          </span>
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-2">Web Tool</h3>
        <p className="text-xs ui-text-muted mb-3">
          Enable automatic web search tool calls for supported models/endpoints. Default is on.
        </p>
        <button
          type="button"
          className="flex items-center justify-between w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2.5 text-sm transition-colors"
          onClick={() =>
            void saveSettings({ web_search_enabled: !settings.web_search_enabled }).catch(
              console.error
            )
          }
        >
          <span className="ui-text-primary">
            {settings.web_search_enabled ? "Web search enabled" : "Web search disabled"}
          </span>
          <span className="ui-text-secondary">
            {settings.web_search_enabled ? "Turn off" : "Turn on"}
          </span>
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-3">About</h3>
        <div className="p-4 ui-bg-elevated rounded-xl border ui-border text-sm ui-text-secondary space-y-1">
          <p>
            <span className="ui-text-primary font-medium">Singular Chat</span> -
            v0.1.0
          </p>
          <p>Open-source, privacy-first desktop chat</p>
          <p>All data stored locally on your device</p>
        </div>
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const { settings, saveSettings } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      saveSettings: state.saveSettings,
    }))
  );
  const [local, setLocal] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const savedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setLocal({ ...settings });
  }, [
    settings.openai_api_key,
    settings.anthropic_api_key,
    settings.groq_api_key,
    settings.xai_api_key,
  ]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current !== null) {
        window.clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings(local);
      setSaved(true);
      if (savedTimeoutRef.current !== null) {
        window.clearTimeout(savedTimeoutRef.current);
      }
      savedTimeoutRef.current = window.setTimeout(() => {
        setSaved(false);
        savedTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error("Failed to save API keys:", error);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm ui-text-secondary">
        API keys are stored locally on your device and sent only to the
        respective AI provider.
      </p>
      <ApiKeyInput
        label="OpenAI API Key"
        value={local.openai_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, openai_api_key: v }))}
        placeholder="sk-..."
      />
      <ApiKeyInput
        label="Anthropic API Key"
        value={local.anthropic_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, anthropic_api_key: v }))}
        placeholder="sk-ant-..."
      />
      <ApiKeyInput
        label="Groq API Key"
        value={local.groq_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, groq_api_key: v }))}
        placeholder="gsk_..."
      />
      <ApiKeyInput
        label="xAI (Grok) API Key"
        value={local.xai_api_key}
        onChange={(v) => setLocal((s) => ({ ...s, xai_api_key: v }))}
        placeholder="xai-..."
      />
      <button
        type="button"
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        style={{
          background: "var(--accent)",
          color: "var(--text-on-accent)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--accent-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--accent)";
        }}
        onClick={handleSave}
      >
        {saved ? <CheckCircle2 size={15} /> : null}
        {saved ? "Saved!" : "Save API Keys"}
      </button>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings size={15} /> },
  { id: "api-keys", label: "API Keys", icon: <Key size={15} /> },
];

export function SettingsModal() {
  const { setShowSettings } = useAppStore(
    useShallow((state) => ({
      setShowSettings: state.setShowSettings,
    }))
  );
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="ui-bg-main border ui-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex overflow-hidden">
        <div className="w-48 ui-bg-sidebar border-r ui-border flex flex-col py-4 shrink-0">
          <h2 className="text-sm font-semibold ui-text-primary px-4 mb-4">
            Settings
          </h2>
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "ui-text-primary"
                  : "ui-text-secondary ui-hover-text"
              }`}
              style={{
                background:
                  activeTab === tab.id ? "var(--bg-sidebar-active)" : "transparent",
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b ui-border shrink-0">
            <h3 className="text-sm font-semibold ui-text-primary">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              type="button"
              className="p-1.5 rounded-lg ui-text-muted ui-hover-text transition-colors"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-sidebar-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onClick={() => setShowSettings(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "general" && <GeneralTab />}
            {activeTab === "api-keys" && <ApiKeysTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
