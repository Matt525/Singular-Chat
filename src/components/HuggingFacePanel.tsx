import { listen } from "@tauri-apps/api/event";
import { Download, Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { HfGgufFile, HfModelSearchResult, LocalModelImportProgress } from "../types";
import { useShallow } from "zustand/react/shallow";

interface HuggingFacePanelProps {
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

export function HuggingFacePanel({ compact = false }: HuggingFacePanelProps) {
  const { searchHfModels, listHfGgufFiles, downloadHfAndImportModel } = useAppStore(
    useShallow((state) => ({
      searchHfModels: state.searchHfModels,
      listHfGgufFiles: state.listHfGgufFiles,
      downloadHfAndImportModel: state.downloadHfAndImportModel,
    }))
  );

  const [query, setQuery] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [revision, setRevision] = useState("main");
  const [results, setResults] = useState<HfModelSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [files, setFiles] = useState<HfGgufFile[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [modelName, setModelName] = useState("");
  const [runningImport, setRunningImport] = useState(false);
  const [importProgress, setImportProgress] = useState<LocalModelImportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const importUnlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    listen<LocalModelImportProgress>("local-model-import-progress", (e) => {
      setImportProgress(e.payload);
    }).then((fn) => {
      importUnlistenRef.current = fn;
    });

    return () => {
      importUnlistenRef.current?.();
    };
  }, []);

  const importProgressPercent =
    importProgress?.total && importProgress.completed
      ? Math.round((importProgress.completed / importProgress.total) * 100)
      : null;

  const selectRepo = async (repoId: string) => {
    setErrorMessage(null);
    setInfoMessage(null);
    setSelectedRepo(repoId);
    setFiles([]);
    setSelectedFile("");
    setModelName("");
    setLoadingFiles(true);
    try {
      const ggufFiles = await listHfGgufFiles(repoId, hfToken);
      setFiles(ggufFiles);
      setSelectedFile(ggufFiles[0]?.name ?? "");
      const defaultModel = repoId.split("/").pop() ?? repoId;
      setModelName(defaultModel.toLowerCase().replace(/[^a-z0-9._:-]/g, "-"));
      setInfoMessage(`Loaded ${ggufFiles.length} GGUF file(s) from ${repoId}.`);
    } catch (e) {
      const message = getErrorMessage(e);
      if (message.toLowerCase().includes("not available")) {
        setErrorMessage(`${message} If it is private or gated, provide a Hugging Face token.`);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSearch = async () => {
    const q = query.trim();
    setErrorMessage(null);
    setInfoMessage(null);
    setSelectedRepo(null);
    setFiles([]);
    setSelectedFile("");
    if (!q) {
      setResults([]);
      return;
    }

    setLoadingSearch(true);
    try {
      const items = await searchHfModels(q, { hfToken, limit: 40 });
      setResults(items);
      if (items.length === 0) {
        setInfoMessage("No repositories matched your query.");
      } else {
        setInfoMessage(`Found ${items.length} matching repositories.`);
      }
    } catch (e) {
      setResults([]);
      setErrorMessage(getErrorMessage(e));
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleImport = async () => {
    if (!selectedRepo || !selectedFile || !modelName.trim()) {
      setErrorMessage("Select a repository/file and provide a target model name.");
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setRunningImport(true);
    setImportProgress(null);
    try {
      await downloadHfAndImportModel({
        repoId: selectedRepo,
        fileName: selectedFile,
        modelName: modelName.trim(),
        revision,
        hfToken,
      });
      setInfoMessage(`Imported "${modelName.trim()}" into Ollama.`);
    } catch (e) {
      setErrorMessage(getErrorMessage(e));
    } finally {
      setRunningImport(false);
      setImportProgress(null);
    }
  };

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-1">Hugging Face Search</h3>
        <p className="text-xs ui-text-muted mb-3">
          Search repositories, select a GGUF file, then download and import directly into Ollama.
        </p>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
            placeholder="Search models (e.g. llama 3 gguf)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loadingSearch) {
                  handleSearch();
                }
              }}
            />
            <button
              className="px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
              aria-label="Search Hugging Face models"
              title="Search Hugging Face models"
              disabled={loadingSearch}
              onClick={handleSearch}
            >
              {loadingSearch ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
          <input
            className="w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
            placeholder="Hugging Face token (optional)"
            value={hfToken}
            onChange={(e) => setHfToken(e.target.value)}
          />
          <input
            className="w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
            placeholder="Revision (default: main)"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
          />
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

      {runningImport && importProgress && (
        <div className="p-3 ui-bg-elevated rounded-xl border ui-border">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin ui-text-primary" />
            <span className="text-sm ui-text-primary truncate">
              {importProgress.stage === "download" ? "Downloading from Hugging Face" : "Importing into Ollama"}
            </span>
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
        <h3 className="text-sm font-semibold ui-text-primary mb-2">Results</h3>
        <div className={`${compact ? "max-h-[300px]" : "max-h-72"} overflow-y-auto pr-1 space-y-2`}>
          {results.length === 0 && (
            <div className="text-xs ui-text-muted px-1">Run a search to see repositories.</div>
          )}
          {results.map((item) => {
            const requiresToken = (item.private || item.gated) && !hfToken.trim();
            return (
              <button
                key={item.id}
                className="w-full text-left p-3 rounded-xl border ui-border transition-colors disabled:opacity-60"
                style={{
                  background:
                    selectedRepo === item.id ? "var(--bg-sidebar-active)" : "var(--bg-elevated)",
                }}
                onMouseEnter={(e) => {
                  if (selectedRepo !== item.id && !requiresToken) {
                    e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedRepo !== item.id) e.currentTarget.style.background = "var(--bg-elevated)";
                }}
                onClick={() => {
                  if (requiresToken) {
                    setErrorMessage(
                      `Repository '${item.id}' requires a Hugging Face token. Add a token and try again.`
                    );
                    return;
                  }
                  selectRepo(item.id);
                }}
                disabled={loadingFiles || requiresToken}
                title={item.id}
              >
                <div className="text-sm font-medium ui-text-primary truncate">{item.id}</div>
                <div className="text-xs ui-text-muted mt-1 flex gap-3">
                  <span>Downloads: {item.downloads?.toLocaleString() ?? "-"}</span>
                  <span>Likes: {item.likes?.toLocaleString() ?? "-"}</span>
                  {item.pipeline_tag && <span>{item.pipeline_tag}</span>}
                  {item.private && <span>Private</span>}
                  {item.gated && <span>Gated</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold ui-text-primary mb-2">Import Selected</h3>
        {!selectedRepo ? (
          <div className="text-xs ui-text-muted px-1">Select a repository from results.</div>
        ) : loadingFiles ? (
          <div className="flex items-center gap-2 text-xs ui-text-muted px-1">
            <Loader2 size={12} className="animate-spin" />
            Loading GGUF files...
          </div>
        ) : files.length === 0 ? (
          <div className="text-xs ui-text-muted px-1">No GGUF files found in selected repository.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs ui-text-secondary truncate px-1">{selectedRepo}</div>
            <select
              className="w-full ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
            >
              {files.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                  {typeof file.size === "number" ? ` (${(file.size / 1e9).toFixed(2)} GB)` : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                className="flex-1 ui-bg-elevated border ui-border rounded-xl px-3 py-2 text-sm ui-text-primary outline-none ui-input"
                placeholder="Target Ollama model name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !runningImport) {
                    handleImport();
                  }
                }}
              />
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
                onClick={handleImport}
                disabled={runningImport || !selectedFile || !modelName.trim()}
              >
                {runningImport ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
