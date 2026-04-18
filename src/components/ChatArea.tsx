import { useCallback, useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import type { Message } from "../types";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ModelSelector } from "./ModelSelector";
import { preloadMessageMarkdown } from "./preloadMessageMarkdown";
import { WelcomeScreen } from "./WelcomeScreen";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: Message[] = [];

export function ChatArea() {
  const {
    currentConversationId,
    isStreaming,
    isLoadingMessages,
    imageGenEnabled,
    sendMessage,
    sendImageMessage,
    createNewChat,
  } = useAppStore(
    useShallow((state) => ({
      currentConversationId: state.currentConversationId,
      isStreaming: state.isStreaming,
      isLoadingMessages: state.isLoadingMessages,
      imageGenEnabled: state.imageGenEnabled,
      sendMessage: state.sendMessage,
      sendImageMessage: state.sendImageMessage,
      createNewChat: state.createNewChat,
    }))
  );

  const messages = useAppStore((state) => {
    if (!state.currentConversationId) return EMPTY_MESSAGES;
    return state.messages[state.currentConversationId] ?? [];
  });
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!currentConversationId || (!hasMessages && !isStreaming)) {
      return;
    }

    preloadMessageMarkdown();
  }, [currentConversationId, hasMessages, isStreaming]);

  const handleSend = useCallback(
    async (content: string) => {
      try {
        preloadMessageMarkdown();
        if (!currentConversationId) {
          await createNewChat();
        }
        if (imageGenEnabled) {
          await sendImageMessage(content);
          return;
        }
        await sendMessage(content);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [currentConversationId, createNewChat, imageGenEnabled, sendImageMessage, sendMessage]
  );

  if (!currentConversationId || (!hasMessages && !isStreaming)) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex flex-col h-full ui-bg-main">
      <div className="flex items-center justify-center h-12 shrink-0 relative border-b ui-border px-4">
        <div className="flex items-center gap-2">
          <ModelSelector />
        </div>
      </div>

      {isLoadingMessages ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full animate-bounce"
                style={{
                  animationDelay: `${i * 0.15}s`,
                  background: "var(--text-muted)",
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <MessageList />
      )}

      <div className="w-full max-w-3xl mx-auto px-5 pb-6 pt-3 ui-bg-main">
        <MessageInput onSend={handleSend} />
      </div>
    </div>
  );
}
