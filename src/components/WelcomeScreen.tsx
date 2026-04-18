import { useCallback } from "react";
import { useAppStore } from "../stores/appStore";
import { MessageInput } from "./MessageInput";
import { ModelSelector } from "./ModelSelector";
import { preloadMessageMarkdown } from "./preloadMessageMarkdown";
import { useShallow } from "zustand/react/shallow";

export function WelcomeScreen() {
  const { sendMessage, sendImageMessage, imageGenEnabled, currentConversationId, createNewChat } =
    useAppStore(
      useShallow((state) => ({
        sendMessage: state.sendMessage,
        sendImageMessage: state.sendImageMessage,
        imageGenEnabled: state.imageGenEnabled,
        currentConversationId: state.currentConversationId,
        createNewChat: state.createNewChat,
      }))
    );

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

  return (
    <div className="flex flex-col h-full ui-bg-main">
      <div className="flex items-center justify-center h-12 shrink-0 relative border-b ui-border px-4">
        <div className="flex items-center gap-2">
          <ModelSelector />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5">
        <h1 className="text-[2rem] font-semibold ui-text-primary mb-8 tracking-tight text-center">
          How can I help you today?
        </h1>
        <div className="w-full max-w-3xl">
          <MessageInput onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
