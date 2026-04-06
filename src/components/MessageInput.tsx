import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isStreaming } = useAppStore();

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="relative bg-[#2f2f2f] rounded-2xl border border-[#3f3f3f] shadow-lg focus-within:border-[#6b6b6b] transition-colors">
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent text-[#ececec] placeholder-[#8e8ea0] resize-none outline-none px-4 pt-3.5 pb-12 text-sm leading-relaxed max-h-[200px] overflow-y-auto"
          placeholder={placeholder ?? "Message Singular Chat…"}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />

        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
          <button
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
              canSend
                ? "bg-[#ececec] text-[#171717] hover:bg-white"
                : isStreaming
                ? "bg-[#ececec] text-[#171717] hover:bg-white"
                : "bg-[#3f3f3f] text-[#6b6b6b] cursor-not-allowed"
            }`}
            onClick={isStreaming ? undefined : handleSend}
            disabled={!canSend && !isStreaming}
            title={isStreaming ? "Generating…" : "Send message"}
          >
            {isStreaming ? <Square size={13} fill="currentColor" /> : <ArrowUp size={15} />}
          </button>
        </div>

        <div className="absolute bottom-3.5 left-4 text-xs text-[#6b6b6b]">
          {isStreaming && <span className="animate-pulse">Generating…</span>}
        </div>
      </div>
      <p className="text-center text-[10px] text-[#6b6b6b] mt-2">
        AI can make mistakes. Verify important information.
      </p>
    </div>
  );
}
