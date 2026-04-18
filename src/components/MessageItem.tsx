import { lazy, memo, Suspense } from "react";
import type { Message } from "../types";

const MessageMarkdown = lazy(() =>
  import("./MessageMarkdown").catch((error) => {
    console.error("Failed to load markdown renderer:", error);
    return { default: PlainAssistantMarkdown };
  })
);

function PlainAssistantMarkdown({ content }: { content: string }) {
  return <div className="whitespace-pre-wrap break-words leading-relaxed">{content}</div>;
}

interface Props {
  message: Message;
  isStreaming?: boolean;
  toolStatus?: string;
}

function MessageItemComponent({ message, isStreaming, toolStatus }: Props) {
  const isUser = message.role === "user";
  const statusLabel = toolStatus === "searching_web" ? "Searching the web" : "Thinking";

  if (isUser) {
    return (
      <div className="flex justify-end mb-7">
        <div className="max-w-[78%] ui-bg-user rounded-[26px] px-5 py-3 text-[15px] ui-text-primary leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  if (isStreaming) {
    const hasContent = message.content.trim().length > 0;
    return (
      <div className="mb-7 max-w-3xl w-full">
        {hasContent ? (
          <div className="stream-live text-[15px] ui-text-primary whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
            <span className="streaming-inline-cursor" />
          </div>
        ) : (
          <div className="thinking-row text-[15px] ui-text-primary">
            <span className="status-text-shimmer">{statusLabel}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-7 max-w-3xl w-full">
      <div className="min-w-0 prose text-[15px] ui-text-primary">
        {message.used_web && (
          <div className="mb-2">
            <span className="web-tool-badge">Web</span>
          </div>
        )}
        <Suspense fallback={<PlainAssistantMarkdown content={message.content} />}>
          <MessageMarkdown content={message.content} />
        </Suspense>
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemComponent);
