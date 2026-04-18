import { ArrowUp, Image, Mic, Plus, Sparkles, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useShallow } from "zustand/react/shallow";

interface Props {
  onSend: (content: string) => void | Promise<void>;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    isStreaming,
    stopStreaming,
    reasoningEnabled,
    setReasoningEnabled,
    imageGenEnabled,
    setImageGenEnabled,
  } = useAppStore(
    useShallow((state) => ({
      isStreaming: state.isStreaming,
      stopStreaming: state.stopStreaming,
      reasoningEnabled: state.reasoningEnabled,
      setReasoningEnabled: state.setReasoningEnabled,
      imageGenEnabled: state.imageGenEnabled,
      setImageGenEnabled: state.setImageGenEnabled,
    }))
  );

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) {
      return;
    }
    void Promise.resolve()
      .then(() => onSend(trimmed))
      .catch(console.error);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [disabled, isStreaming, onSend, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  };

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  return (
    <div className="w-full">
      <div
        className="relative flex flex-col ui-bg-input border ui-border-strong rounded-[24px] transition-colors px-3.5 py-2.5"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-input-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-input)";
        }}
      >
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute left-3 bottom-[calc(100%+8px)] z-50 w-48 rounded-xl border ui-border ui-bg-elevated shadow-xl p-1"
          >
            <button
              className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm rounded-lg ui-text-primary ui-hover-bg"
              onClick={() => {
                setReasoningEnabled(!reasoningEnabled);
                setMenuOpen(false);
              }}
            >
              <span className="flex items-center gap-2.5">
                <Sparkles size={14} className="ui-text-secondary" />
                Reasoning
              </span>
              {reasoningEnabled && <span className="text-xs ui-text-muted">On</span>}
            </button>
            <button
              className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm rounded-lg ui-text-primary ui-hover-bg"
              onClick={() => {
                setImageGenEnabled(!imageGenEnabled);
                setMenuOpen(false);
              }}
            >
              <span className="flex items-center gap-2.5">
                <Image size={14} className="ui-text-secondary" />
                ImageGen
              </span>
              {imageGenEnabled && <span className="text-xs ui-text-muted">On</span>}
            </button>
          </div>
        )}

        {(reasoningEnabled || imageGenEnabled) && (
          <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
            {reasoningEnabled && (
              <button
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ui-border ui-text-primary"
                style={{ background: "var(--bg-sidebar-active)" }}
                onClick={() => setReasoningEnabled(false)}
                title="Disable reasoning"
              >
                reasoning
                <X size={12} />
              </button>
            )}
            {imageGenEnabled && (
              <button
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ui-border ui-text-primary"
                style={{ background: "var(--bg-sidebar-active)" }}
                onClick={() => setImageGenEnabled(false)}
                title="Disable ImageGen"
              >
                ImageGen
                <X size={12} />
              </button>
            )}
          </div>
        )}

        <div className="flex items-end">
          <button
            className="shrink-0 p-1.5 rounded-lg ui-text-secondary transition-colors mb-0.5"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-sidebar-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onClick={() => setMenuOpen((v) => !v)}
            title="Prompt tools"
          >
            <Plus size={18} />
          </button>

          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent ui-text-primary resize-none outline-none px-3 py-1.5 text-[15px] leading-relaxed max-h-[220px] overflow-y-auto ui-input"
            placeholder={imageGenEnabled ? "Describe the image you want to generate" : "Ask anything"}
            style={{ color: "var(--text-primary)" }}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
          />

          <div className="flex items-center gap-1 shrink-0 mb-0.5">
            <button
              className="p-1.5 rounded-lg ui-text-secondary transition-colors"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
              title="Voice input"
            >
              <Mic size={18} />
            </button>

            <button
              className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
              style={{
                background: isStreaming
                  ? "var(--bg-sidebar-active)"
                  : canSend
                    ? "var(--accent)"
                    : "var(--bg-sidebar-active)",
                color: isStreaming
                  ? "var(--text-primary)"
                  : canSend
                    ? "var(--text-on-accent)"
                    : "var(--text-muted)",
                cursor: isStreaming || canSend ? "pointer" : "not-allowed",
              }}
              onClick={isStreaming ? () => void stopStreaming() : handleSend}
              disabled={!canSend && !isStreaming}
              title={isStreaming ? "Stop generating" : "Send"}
            >
              {isStreaming ? <Square size={14} /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] ui-text-muted mt-2">
        Singular Chat can make mistakes. Verify important information.
      </p>
    </div>
  );
}
