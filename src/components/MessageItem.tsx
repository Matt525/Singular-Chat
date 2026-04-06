import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlighted = language
    ? hljs.getLanguage(language)
      ? hljs.highlight(code, { language }).value
      : hljs.highlightAuto(code).value
    : hljs.highlightAuto(code).value;

  const detectedLang = language || hljs.highlightAuto(code).language || "text";

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#3f3f3f]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d3d]">
        <span className="text-xs text-[#8e8ea0] font-mono">{detectedLang}</span>
        <button
          className="flex items-center gap-1.5 text-xs text-[#8e8ea0] hover:text-[#ececec] transition-colors"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check size={12} />
              Copied
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#1e1e2e] p-4 text-sm font-mono leading-relaxed">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

interface Props {
  message: Message;
  isStreaming?: boolean;
}

export function MessageItem({ message, isStreaming }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[85%] bg-[#2f2f2f] rounded-3xl px-5 py-3 text-sm text-[#ececec] leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-6 max-w-3xl w-full">
      {/* Assistant avatar */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[#10a37f] to-[#7c3aed] flex items-center justify-center mt-0.5">
        <span className="text-white text-xs font-bold">S</span>
      </div>

      <div className={`flex-1 prose text-sm ${isStreaming ? "streaming-cursor" : ""}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const isInline = !className;
              const code = String(children).replace(/\n$/, "");

              if (!isInline) {
                return <CodeBlock language={match?.[1] ?? ""} code={code} />;
              }
              return (
                <code
                  className="bg-[#374151] text-[#e5e7eb] px-1.5 py-0.5 rounded text-[0.8em] font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            // Override p to avoid extra margins
            p({ children }) {
              return <p className="my-1.5 leading-relaxed">{children}</p>;
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
