import { useEffect } from "react";
import { AssistantsModal } from "./components/AssistantsModal";
import { ChatArea } from "./components/ChatArea";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./stores/appStore";

export default function App() {
  const { init, showSettings, showAssistants } = useAppStore();

  useEffect(() => {
    init().catch(console.error);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#212121] text-[#ececec]">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatArea />
      </main>

      {showSettings && <SettingsModal />}
      {showAssistants && <AssistantsModal />}
    </div>
  );
}
