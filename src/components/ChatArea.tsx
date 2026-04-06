import { useAppStore } from "../stores/appStore";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ModelSelector } from "./ModelSelector";
import { WelcomeScreen } from "./WelcomeScreen";

export function ChatArea() {
  const {
    currentConversationId,
    currentMessages,
    isStreaming,
    sendMessage,
    isLoadingMessages,
    createNewChat,
  } = useAppStore();

  const messages = currentMessages();
  const hasMessages = messages.length > 0;

  if (!currentConversationId || (!hasMessages && !isStreaming)) {
    return <WelcomeScreen />;
  }

  const handleSend = async (content: string) => {
    if (!currentConversationId) {
      await createNewChat();
    }
    sendMessage(content);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-center py-2 border-b border-[#2a2a2a] shrink-0">
        <ModelSelector />
      </div>

      {/* Messages */}
      {isLoadingMessages ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[#8e8ea0] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <MessageList />
      )}

      {/* Input */}
      <MessageInput onSend={handleSend} disabled={false} />
    </div>
  );
}
