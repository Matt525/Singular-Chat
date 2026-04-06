import { useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { MessageItem } from "./MessageItem";

export function MessageList() {
  const { currentMessages, isStreaming, streamingConversationId, currentConversationId } =
    useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = currentMessages();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // Also scroll on streaming content changes
  const { streamingContent } = useAppStore();
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [streamingContent, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isStreaming={
              msg.id === "__streaming__" &&
              isStreaming &&
              streamingConversationId === currentConversationId
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
