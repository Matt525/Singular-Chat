import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { LocalModelImportProgress, ModelPullProgress } from "../types";
import { POPULAR_OLLAMA_MODELS } from "../types";
import { useShallow } from "zustand/react/shallow";

interface LocalModelsPanelProps {
  compact?: boolean;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

export function LocalModelsPanel({ compact = false }: LocalModelsPanelProps) {
  const {
    settings,
    saveSettings,
    ollamaModels,
    ollamaOnline,
    ollamaRuntime,
    refreshOllamaRuntime,
    installOrUpdateOllama,
    refreshOllamaModels,
    pullOllamaModel,
    deleteOllamaModel,
    importLocalGgufModel,
  } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      saveSettings: state.saveSettings,
      ollamaModels: state.ollamaModels,
      ollamaOnline: state.ollamaOnline,
      ollamaRuntime: state.ollamaRuntime,
      refreshOllamaRuntime: state.refreshOllamaRuntime,
      installOrUpdateOllama: state.installOrUpdateOllama,
      refreshOllamaModels: state.refreshOllamaModels,
      pullOllamaModel: state.pullOllamaModel,
      deleteOllamaModel: state.deleteOllamaModel,
      importLocalGgufModel: state.importLocalGgufModel,
    }))
  );

  const [ollamaUrl, setOllamaUrl] = useState(settings.ollama_url);
  const [urlSaved, setUrlSaved] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<{
    status: string;
    completed?: number;
    total?: number;
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const [localImportPath, setLocalImportPath] = useState("");
  const [localImportModelName, setLocalImportModelName] = useState("");
  const [runningImport, setRunningImport] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<LocalModelImportProgress | null>(null);
  const [installingOllama, setInstallingOllama] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const importUnlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setOllamaUrl(settings.ollama_url);
  }, [settings.ollama_url]);

  useEffect(() => {
    refreshOllamaRuntime().catch(() => {
      // Ignore panel-level refresh failures; store init will retry.
    });
  }, [refreshOllamaRuntime]);

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

    listen<LocalModelImportProgress>("local-model-import-progress", (e) => {
      setImportProgress(e.payload);
    }).then((fn) => {
      importUnlistenRef.current = fn;
    });

    return () => {
      unlistenRef.current?.();
      importUnlistenRef.current?.();
    };
  }, []);

  const handlePull = async (name: string) => {
    if (!ollamaRuntime?.installed || !ollamaOnline || installingOllama) {
      return;
    }
    setErrorMessage(null);
    setInfoMessage(null);
    setPulling(name);
    setPullProgress(null);
    try {
      await pullOllamaModel(name);
      setInfoMessage(`Model "${name}" downloaded successfully.`);
    } catch (e) {
      setErrorMessage(`Failed to download "${name}": ${getErrorMessage(e)}`);
    } finally {
      setPulling(null);
      setPullProgress(null);
    }
  };

  const handleDelete = async (name: string) => {
    setErrorMessage(null);
    setInfoMessage(null);
    setDeleting(name);
    try {
      await deleteOllamaModel(name);
      setInfoMessage(`Deleted model "${name}".`);
    } catch (e) {
      setErrorMessage(`Failed to delete "${name}": ${getErrorMessage(e)}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleLocalImport = async () => {
    if (!ollamaRuntime?.installed || !ollamaOnline || installingOllama) {
      return;
    }
    setErrorMessage(null);
    setInfoMessage(null);
    const path = localImportPath.trim();
    const model = localImportModelName.trim();
    if (!path || !model) {
      setErrorMessage("Provide both a GGUF file path and target model name.");
      return;
    }

    setRunningImport(model);
    setImportProgress(null);
    try {
      await importLocalGgufModel(model, path);
      setInfoMessage(`Imported "${model}" from local GGUF file.`);
      setLocalImportModelName("");
    } catch (e) {
      setErrorMessage(`Failed local import: ${getErrorMessage(e)}`);
    } finally {
      setRunningImport(null);
      setImportProgress(null);
    }
  };

  const handleInstallOrUpdate = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setInstallingOllama(true);
    try {
      const result = await installOrUpdateOllama();
      setInfoMessage(result || "Ollama install/update started.");
      await refreshOllamaRuntime();
      if (useAppStore.getState().ollamaOnline) {
        await refreshOllamaModels();
      }
    } catch (e) {
      setErrorMessage(`Failed to install/update Ollama: ${getErrorMessage(e)}`);
    } finally {
      setInstallingOllama(false);
    }
  };

  const downloadedNames = useMemo(() => new Set(ollamaModels.map((m) => m.name)), [ollamaModels]);
  const progressPercent =
    pullProgress?.total && pullProgress.completed
      ? Math.round((pullProgress.completed / pullProgress.total) * 100)
      : null;
  const importProgressPercent =
    importProgress?.total && importProgress.completed
      ? Math.round((importProgress.completed / importProgress.total) * 100)
      : null;
  const localModelOpsDisabled = !ollamaRuntime?.installed || !ollamaOnline || installingOllama;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-1">Ollama Server</h3>
        <p className="text-xs ui-text-muted mb-3">
          Ollama runs models locally, and can now be installed or updated directly from this panel.{" "}
          <a
            href="https://ollama.com"
            className="ui-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install Ollama
          </a>
        </p>

        {!ollamaRuntime?.installed && (
          <div className="mb-3 p-3 rounded-xl border ui-border ui-bg-elevated">
            <p className="text-xs ui-text-secondary mb-2">
              Ollama is not installed on this machine yet.
            </p>
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
              disabled={installingOllama}
              onClick={handleInstallOrUpdate}
            >
              {installingOllama ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download size={14} />
                  Install Ollama
                </>
              )}
            </button>
          </div>
        )}

        {ollamaRuntime?.installed && ollamaRuntime.update_available && (
          <div className="mb-3 p-3 rounded-xl border ui-border ui-bg-elevated">
            <p className="text-xs ui-text-secondary mb-2">
              Update available: {ollamaRuntime.local_version ?? "unknown"} to{" "}
              {ollamaRuntime.latest_version ?? "latest"}.
            </p>
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
              disabled={installingOllama}
              onClick={handleInstallOrUpdate}
            >
              {installingOllama ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  Update Ollama
                </>
              )}
            </button>
          </div>
        )}

        <p className="text-[11px] ui-text-muted mb-3">
          {!ollamaRuntime?.installed
            ? "Install Ollama first, then return here to pull models."
            : !ollamaOnline
              ? "Tip: run `ollama serve` if the local server is not active."
              : "Ollama is connected and ready for local model downloads."}
        </p>

        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-2 h-2 rounded-full ${ollamaOnline ? "bg-green-500" : "bg-red-400"}`}
          />
          <span className="text-sm ui-text-secondary">
            {!ollamaRuntime?.installed
              ? "Not installed"
              : ollamaOnline
                ? "Connected"
                : "Installed, not running"}
          </span>
          {ollamaRuntime?.installed && (
            <span className="text-[11px] ui-text-muted">
              v{ollamaRuntime.local_version ?? "unknown"}
            </span>
          )}
          <button
            className="ml-auto text-xs ui-link"
            onClick={async () => {
              setErrorMessage(null);
              setInfoMessage(null);
              try {
                await refreshOllamaRuntime();
                if (useAppStore.getState().ollamaOnline) {
                  await refreshOllamaModels();
                }
              } catch (e) {
                setErrorMessage(`Failed to refresh model list: ${getErrorMessage(e)}`);
              }
            }}
          >
            Refresh
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
          <button
            className="px-3 py-2 rounded-xl text-sm ui-text-primary border ui-border transition-colors"
            style={{ background: "var(--bg-sidebar-hover)" }}
            onClick={async () => {
              setErrorMessage(null);
              setInfoMessage(null);
              try {
                await saveSettings({ ollama_url: ollamaUrl });
                setUrlSaved(true);
                setInfoMessage("Saved Ollama URL.");
                setTimeout(() => setUrlSaved(false), 2000);
              } catch (e) {
                setErrorMessage(`Failed to save URL: ${getErrorMessage(e)}`);
              }
            }}
          >
            {urlSaved ? <CheckCircle2 size={14} className="text-green-500" /> : "Save"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl border text-xs" style={{ borderColor: "#ef4444", color: "#fca5a5", background: "rgba(239,68,68,0.08)" }}>
          {errorMessage}
        </div>
      )}

      {infoMessage && !errorMessage && (
        <div className="p-3 rounded-xl border text-xs" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)", background: "var(--bg-elevated)" }}>
          {infoMessage}
        </div>
      )}

      {ollamaModels.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold ui-text-primary mb-3">Downloaded ({ollamaModels.length})</h3>
          <div className="space-y-2">
            {ollamaModels.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between p-3 ui-bg-elevated rounded-xl border ui-border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium ui-text-primary truncate">{m.name}</p>
                  <p className="text-xs ui-text-muted">{(m.size / 1e9).toFixed(1)} GB</p>
                </div>
                <button
                  className="p-1.5 ui-text-muted transition-colors"
                  aria-label={`Delete model ${m.name}`}
                  title={`Delete model ${m.name}`}
                  onClick={() => handleDelete(m.name)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                  disabled={deleting === m.name || !ollamaOnline}
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

      {pulling && pullProgress && (
        <div className="p-3 ui-bg-elevated rounded-xl border ui-border">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin ui-text-primary" />
            <span className="text-sm ui-text-primary truncate">Downloading {pulling}...</span>
          </div>
          <p className="text-xs ui-text-muted mb-1">{pullProgress.status}</p>
          {progressPercent !== null && (
            <div className="w-full rounded-full h-1.5" style={{ background: "var(--border-subtle)" }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${progressPercent}%`, background: "var(--accent)" }}
              />
            </div>
          )}
        </div>
      )}

      {runningImport && importProgress && (
        <div className="p-3 ui-bg-elevated rounded-xl border ui-border">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin ui-text-primary" />
            <span className="text-sm ui-text-primary truncate">Importing local GGUF into Ollama</span>
          </div>
          <p className="text-xs ui-text-muted mb-1">{importProgress.status}</p>
          {importProgressPercent !== null && (
            <div className="w-full rounded-full h-1.5" style={{ background: "var(--border-subtle)" }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${importProgressPercent}%`, background: "var(--accent)" }}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-1">Import Local GGUF</h3>
        <p className="text-xs ui-text-muted mb-3">
          Import any local <code>.gguf</code> file into Ollama by model name.
        </p>
        <div className="space-y-2">
          <input
            className="w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
            placeholder="GGUF file path (e.g. C:\\models\\model.gguf)"
            value={localImportPath}
            onChange={(e) => setLocalImportPath(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
              placeholder="Target Ollama model name (e.g. my-model:latest)"
              value={localImportModelName}
              onChange={(e) => setLocalImportModelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !runningImport) {
                  handleLocalImport();
                }
              }}
            />
            <button
              className="px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
              disabled={!!runningImport || !!pulling || localModelOpsDisabled}
              onClick={handleLocalImport}
            >
              Import
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-1">Download a Model</h3>
        <p className="text-xs ui-text-muted mb-3">
          Pull any model from{" "}
          <a
            href="https://ollama.com/library"
            className="ui-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            ollama.com/library
          </a>
        </p>

        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
            placeholder="e.g. llama3.2, gemma2:9b"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customModel.trim()) {
                handlePull(customModel.trim());
              }
            }}
          />
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
            disabled={!customModel.trim() || !!pulling || !!runningImport || localModelOpsDisabled}
            onClick={() => handlePull(customModel.trim())}
          >
            <Download size={14} />
            Pull
          </button>
        </div>

        <div className={`space-y-2 ${compact ? "max-h-[300px]" : "max-h-64"} overflow-y-auto pr-1`}>
          {POPULAR_OLLAMA_MODELS.map((m) => {
            const downloaded = downloadedNames.has(m.name);
            const isPulling = pulling === m.name;
            return (
              <div
                key={m.name}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border ui-border transition-colors"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium ui-text-primary truncate">{m.name}</p>
                  <p className="text-xs ui-text-muted truncate">{m.description} - {m.size}</p>
                </div>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                    downloaded || isPulling ? "opacity-70 cursor-default" : ""
                  }`}
                  style={{
                    background:
                      downloaded || isPulling ? "var(--bg-sidebar-hover)" : "var(--accent)",
                    color:
                      downloaded || isPulling ? "var(--text-secondary)" : "var(--text-on-accent)",
                  }}
                  disabled={
                    downloaded || isPulling || !!pulling || !!runningImport || localModelOpsDisabled
                  }
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
                      Downloading...
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
