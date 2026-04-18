import { useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { MessageItem } from "./MessageItem";
import { useShallow } from "zustand/react/shallow";

export function MessageList() {
  const {
    currentConversationId,
    messages,
    isStreaming,
    streamingConversationId,
    streamingContent,
    currentToolStatus,
  } = useAppStore(
    useShallow((state) => ({
      currentConversationId: state.currentConversationId,
      messages: state.messages,
      isStreaming: state.isStreaming,
      streamingConversationId: state.streamingConversationId,
      streamingContent: state.streamingContent,
      currentToolStatus: state.currentConversationId
        ? state.toolStatusByConversation[state.currentConversationId]
        : undefined,
    }))
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationMessages = currentConversationId ? messages[currentConversationId] ?? [] : [];
  const toolStatus = currentToolStatus;

  const displayMessages = useMemo(() => {
    if (!currentConversationId) {
      return [];
    }

    if (isStreaming && streamingConversationId === currentConversationId) {
      return [
        ...conversationMessages,
        {
          id: "__streaming__",
          conversation_id: currentConversationId,
          role: "assistant" as const,
          content: streamingContent,
          created_at: new Date().toISOString(),
          used_web: false,
        },
      ];
    }

    return conversationMessages;
  }, [
    conversationMessages,
    currentConversationId,
    isStreaming,
    streamingConversationId,
    streamingContent,
  ]);

  useEffect(() => {
    const node = bottomRef.current;
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
        block: "end",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentConversationId, displayMessages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
        {displayMessages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isStreaming={
              msg.id === "__streaming__" &&
              isStreaming &&
              streamingConversationId === currentConversationId
            }
            toolStatus={msg.id === "__streaming__" ? toolStatus : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
