import { Code2, FileText, Lightbulb, Pencil } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { MessageInput } from "./MessageInput";
import { ModelSelector } from "./ModelSelector";

const SUGGESTIONS = [
  {
    icon: <Pencil size={16} />,
    title: "Explain a concept",
    prompt: "Explain quantum entanglement in simple terms",
  },
  {
    icon: <Code2 size={16} />,
    title: "Write code",
    prompt: "Write a Python script to scrape a webpage and extract all links",
  },
  {
    icon: <FileText size={16} />,
    title: "Summarize",
    prompt: "Summarize the key differences between REST and GraphQL APIs",
  },
  {
    icon: <Lightbulb size={16} />,
    title: "Brainstorm",
    prompt: "Give me 10 creative names for a productivity app",
  },
];

export function WelcomeScreen() {
  const { sendMessage, currentConversationId, createNewChat } = useAppStore();

  const handleSend = async (content: string) => {
    if (!currentConversationId) {
      await createNewChat();
    }
    sendMessage(content);
  };

  const handleSuggestion = async (prompt: string) => {
    if (!currentConversationId) {
      await createNewChat();
    }
    sendMessage(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        {/* Logo */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#10a37f] to-[#7c3aed] flex items-center justify-center mb-6 shadow-lg">
          <span className="text-white text-2xl font-bold">S</span>
        </div>

        <h1 className="text-3xl font-semibold text-[#ececec] mb-2">
          What can I help with?
        </h1>
        <p className="text-[#8e8ea0] text-sm mb-10">
          Powered by local and cloud AI models
        </p>

        {/* Suggestions grid */}
        <div className="grid grid-cols-2 gap-2 w-full max-w-2xl mb-10">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              className="flex flex-col gap-2 p-4 bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-2xl text-left transition-colors border border-[#3f3f3f] hover:border-[#4a4a4a]"
              onClick={() => handleSuggestion(s.prompt)}
            >
              <div className="flex items-center gap-2 text-[#10a37f]">{s.icon}</div>
              <div>
                <p className="text-sm font-medium text-[#ececec]">{s.title}</p>
                <p className="text-xs text-[#8e8ea0] mt-0.5 line-clamp-2">{s.prompt}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Model selector */}
        <div className="mb-4">
          <ModelSelector />
        </div>
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} />
    </div>
  );
}
