import { ArrowUp, Mic, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: Props) {
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
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="w-full">
      <div className="relative flex items-end bg-white border border-[#d1d1d1] rounded-2xl shadow-sm hover:border-[#b0b0b0] focus-within:border-[#b0b0b0] transition-colors px-3 py-2">
        {/* Plus / attach button */}
        <button
          className="shrink-0 p-1.5 rounded-lg text-[#6b6b6b] hover:text-[#0d0d0d] hover:bg-[#f0f0f0] transition-colors mb-0.5"
          title="Attach"
        >
          <Plus size={18} />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent text-[#0d0d0d] placeholder-[#9b9b9b] resize-none outline-none px-3 py-1.5 text-sm leading-relaxed max-h-[200px] overflow-y-auto"
          placeholder="Ask anything"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />

        {/* Right buttons */}
        <div className="flex items-center gap-1 shrink-0 mb-0.5">
          <button
            className="p-1.5 rounded-lg text-[#6b6b6b] hover:text-[#0d0d0d] hover:bg-[#f0f0f0] transition-colors"
            title="Voice input"
          >
            <Mic size={18} />
          </button>

          <button
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
              canSend
                ? "bg-[#0d0d0d] text-white hover:bg-[#2d2d2d]"
                : "bg-[#d1d1d1] text-[#9b9b9b] cursor-not-allowed"
            }`}
            onClick={isStreaming ? undefined : handleSend}
            disabled={!canSend && !isStreaming}
            title="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-[#9b9b9b] mt-2">
        Singular Chat can make mistakes. Verify important information.
      </p>
    </div>
  );
}
