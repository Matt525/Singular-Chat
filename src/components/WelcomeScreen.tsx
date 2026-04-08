import { useAppStore } from "../stores/appStore";
import { MessageInput } from "./MessageInput";

export function WelcomeScreen() {
  const { sendMessage, currentConversationId, createNewChat } = useAppStore();

  const handleSend = async (content: string) => {
    if (!currentConversationId) {
      await createNewChat();
    }
    sendMessage(content);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <h1 className="text-[2rem] font-semibold text-[#0d0d0d] mb-8 tracking-tight">
          How can I help you?
        </h1>
        <div className="w-full max-w-2xl">
          <MessageInput onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
