import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { Check, Copy } from "lucide-react";
import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock = memo(function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy code block:", error);
    }
  };

  const canHighlightLanguage = !!language && !!hljs.getLanguage(language);
  const highlightResult = canHighlightLanguage
    ? hljs.highlight(code, { language })
    : hljs.highlightAuto(code);
  const detectedLang = language || highlightResult.language || "text";

  return (
    <div className="my-3 rounded-xl overflow-hidden border ui-border">
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: "var(--bg-code-header)" }}
      >
        <span className="text-xs ui-text-secondary font-mono">{detectedLang}</span>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs ui-text-secondary ui-hover-text transition-colors"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <>
              <Check size={12} /> Copied
            </>
          ) : (
            <>
              <Copy size={12} /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm font-mono leading-relaxed">
        <code className="text-[#ececec]" dangerouslySetInnerHTML={{ __html: highlightResult.value }} />
      </pre>
    </div>
  );
});

interface MessageMarkdownProps {
  content: string;
}

function MessageMarkdownComponent({ content }: MessageMarkdownProps) {
  return (
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
            <code className="px-1.5 py-0.5 rounded text-[0.82em] font-mono" {...props}>
              {children}
            </code>
          );
        },
        p({ children }) {
          return <p className="my-1.5 leading-relaxed">{children}</p>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MessageMarkdownComponent;
