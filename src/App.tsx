import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { ChatArea } from "./components/ChatArea";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./stores/appStore";
import { useShallow } from "zustand/react/shallow";

const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((module) => ({ default: module.SettingsModal }))
);
const AssistantsModal = lazy(() =>
  import("./components/AssistantsModal").then((module) => ({ default: module.AssistantsModal }))
);

const SUPPORTED_THEMES = new Set(["dark", "light", "midnight"]);

export default function App() {
  const { init, showSettings, showAssistants, theme } = useAppStore(
    useShallow((state) => ({
      init: state.init,
      showSettings: state.showSettings,
      showAssistants: state.showAssistants,
      theme: state.settings.theme,
    }))
  );

  useEffect(() => {
    void init().catch(console.error);
  }, [init]);

  useLayoutEffect(() => {
    const nextTheme = SUPPORTED_THEMES.has(theme) ? theme : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden ui-bg-app ui-text-primary">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden ui-bg-main">
        <ChatArea />
      </main>

      <Suspense fallback={null}>
        {showSettings && <SettingsModal />}
        {showAssistants && <AssistantsModal />}
      </Suspense>
    </div>
  );
}
