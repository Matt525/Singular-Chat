import {
  ArrowLeft,
  Edit,
  Globe,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  lazy,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { isThisMonth, isThisWeek, isToday, isYesterday } from "date-fns";
import { useAppStore } from "../stores/appStore";
import type { Conversation } from "../types";
import { Suspense } from "react";
import { useShallow } from "zustand/react/shallow";

const LocalModelsPanel = lazy(() =>
  import("./LocalModelsPanel").then((module) => ({ default: module.LocalModelsPanel }))
);
const HuggingFacePanel = lazy(() =>
  import("./HuggingFacePanel").then((module) => ({ default: module.HuggingFacePanel }))
);

const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_COLLAPSED_WIDTH = 68;
const SIDEBAR_WIDTH_STORAGE_KEY = "singular-sidebar-width";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "singular-sidebar-collapsed";

function groupConversations(conversations: Conversation[]) {
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This week", items: [] },
    { label: "This month", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updated_at);
    if (isToday(date)) {
      groups[0].items.push(conv);
    } else if (isYesterday(date)) {
      groups[1].items.push(conv);
    } else if (isThisWeek(date)) {
      groups[2].items.push(conv);
    } else if (isThisMonth(date)) {
      groups[3].items.push(conv);
    } else {
      groups[4].items.push(conv);
    }
  }
  return groups.filter((g) => g.items.length > 0);
}

interface ConvItemProps {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onRename: (title: string) => void | Promise<void>;
}

function ConvItem({ conv, isActive, onSelect, onDelete, onRename }: ConvItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conv.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!renaming) {
      setRenameValue(conv.title);
    }
  }, [conv.title, renaming]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const submitRename = () => {
    const nextTitle = renameValue.trim();
    if (nextTitle && nextTitle !== conv.title) {
      void Promise.resolve()
        .then(() => onRename(nextTitle))
        .catch(console.error);
    }
    setRenaming(false);
    setRenameValue(conv.title);
  };

  return (
    <div
      className={`conv-item group relative flex items-center gap-1 rounded-lg px-2.5 py-2 cursor-pointer text-[13px] ${
        isActive ? "ui-text-primary" : "ui-text-secondary"
      }`}
      style={{
        background: isActive ? "var(--bg-sidebar-active)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--bg-sidebar-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
        }
      }}
      onClick={() => {
        if (!renaming) {
          void Promise.resolve()
            .then(() => onSelect())
            .catch(console.error);
        }
      }}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none ui-text-primary text-[13px]"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submitRename();
            }
            if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(conv.title);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{conv.title}</span>
      )}

      {!renaming && (
        <div className="conv-actions flex items-center shrink-0" ref={menuRef}>
          <button
            type="button"
            className="p-1 rounded-md ui-text-muted transition-colors"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-sidebar-active)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 ui-bg-elevated border ui-border rounded-xl shadow-lg py-1 w-44">
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm ui-text-primary transition-colors"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                <Edit size={13} />
                Rename
              </button>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 transition-colors"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  void Promise.resolve()
                    .then(() => onDelete())
                    .catch(console.error);
                  setMenuOpen(false);
                }}
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NavButtonProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}

function NavButton({ label, icon, active = false, collapsed = false, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`flex items-center w-full px-3 py-2 rounded-lg text-[13px] transition-colors ${
        collapsed ? "justify-center" : "gap-3"
      } ${active ? "ui-text-primary" : "ui-text-secondary"}`}
      style={{
        background: active ? "var(--bg-sidebar-active)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--bg-sidebar-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
        }
      }}
      onClick={onClick}
      title={label}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

type SidebarView = "chats" | "local-models" | "hugging-face";

function readInitialSidebarWidth() {
  if (typeof window === "undefined") return SIDEBAR_MIN_WIDTH;
  const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  if (Number.isFinite(stored)) {
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, stored));
  }
  return SIDEBAR_MIN_WIDTH;
}

function readInitialCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
}

export function Sidebar() {
  const {
    conversations,
    currentConversationId,
    selectConversation,
    createNewChat,
    deleteConversation,
    renameConversation,
    setShowSettings,
    setShowAssistants,
  } = useAppStore(
    useShallow((state) => ({
      conversations: state.conversations,
      currentConversationId: state.currentConversationId,
      selectConversation: state.selectConversation,
      createNewChat: state.createNewChat,
      deleteConversation: state.deleteConversation,
      renameConversation: state.renameConversation,
      setShowSettings: state.setShowSettings,
      setShowAssistants: state.setShowAssistants,
    }))
  );
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeView, setActiveView] = useState<SidebarView>("chats");
  const [isCollapsed, setIsCollapsed] = useState(readInitialCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const brandLogoSrc = "/Logo3.png?v=20260411";
  const deferredSearch = useDeferredValue(search);

  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - resizeStartXRef.current;
      const next = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, resizeStartWidthRef.current + delta)
      );
      setSidebarWidth(next);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const filtered = useMemo(
    () =>
      conversations.filter((c) =>
        c.title.toLowerCase().includes(deferredSearch.toLowerCase())
      ),
    [conversations, deferredSearch]
  );
  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  const openView = (view: SidebarView) => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
    setSearchOpen(false);
    setActiveView(view);
  };

  return (
    <aside
      className="relative flex flex-col shrink-0 ui-bg-sidebar h-screen select-none border-r ui-border"
      style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth }}
    >
      <div className="px-2.5 pt-2.5 pb-2 space-y-1">
        <div className={`flex items-center px-2.5 py-1.5 ${isCollapsed ? "justify-center" : "gap-2.5"}`}>
          <img
            src={brandLogoSrc}
            alt="Singular Chat"
            className="w-6 h-6 rounded-full object-cover border ui-border"
          />
          {!isCollapsed && <span className="text-sm font-medium ui-text-primary truncate">Singular Chat</span>}
        </div>
        <div className={isCollapsed ? "flex justify-center" : "flex justify-end px-2.5"}>
          <button
            className="w-6 h-6 rounded-full border ui-border ui-bg-elevated flex items-center justify-center ui-text-secondary"
            onClick={() => setIsCollapsed((v) => !v)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
          </button>
        </div>

        <NavButton
          label="New chat"
          icon={<Edit size={15} />}
          collapsed={isCollapsed}
          onClick={() => {
            if (isCollapsed) setIsCollapsed(false);
            setActiveView("chats");
            setSearchOpen(false);
            void Promise.resolve()
              .then(() => createNewChat())
              .catch(console.error);
          }}
        />
        <NavButton
          label="Search chats"
          icon={<Search size={15} />}
          collapsed={isCollapsed}
          active={searchOpen && activeView === "chats"}
          onClick={() => {
            if (isCollapsed) {
              setIsCollapsed(false);
              setActiveView("chats");
              setSearchOpen(true);
              return;
            }
            setActiveView("chats");
            setSearchOpen((v) => !v);
          }}
        />
        <NavButton
          label="Local models"
          icon={<Server size={15} />}
          collapsed={isCollapsed}
          active={activeView === "local-models"}
          onClick={() => {
            setSearchOpen(false);
            openView("local-models");
          }}
        />
        <NavButton
          label="Hugging Face"
          icon={<Globe size={15} />}
          collapsed={isCollapsed}
          active={activeView === "hugging-face"}
          onClick={() => {
            setSearchOpen(false);
            openView("hugging-face");
          }}
        />
        <NavButton
          label="Explore assistants"
          icon={<Sparkles size={15} />}
          collapsed={isCollapsed}
          onClick={() => setShowAssistants(true)}
        />
        <NavButton
          label="Settings"
          icon={<Settings size={15} />}
          collapsed={isCollapsed}
          onClick={() => setShowSettings(true)}
        />
      </div>

      {!isCollapsed && <div className="mx-3.5 border-t ui-border my-1.5" />}

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto px-2.5 pb-2.5">
          {activeView === "local-models" ? (
            <div className="space-y-3 pt-2 pb-2">
              <button
                type="button"
                className="flex items-center gap-2 text-xs ui-text-secondary ui-hover-text px-1 transition-colors"
                onClick={() => openView("chats")}
              >
                <ArrowLeft size={12} />
                Back to chats
              </button>
              <div className="px-1">
                <Suspense fallback={<div className="px-1 py-4 text-xs ui-text-muted">Loading models...</div>}>
                  <LocalModelsPanel compact />
                </Suspense>
              </div>
            </div>
          ) : activeView === "hugging-face" ? (
            <div className="space-y-3 pt-2 pb-2">
              <button
                type="button"
                className="flex items-center gap-2 text-xs ui-text-secondary ui-hover-text px-1 transition-colors"
                onClick={() => openView("chats")}
              >
                <ArrowLeft size={12} />
                Back to chats
              </button>
              <div className="px-1">
                <Suspense fallback={<div className="px-1 py-4 text-xs ui-text-muted">Loading models...</div>}>
                  <HuggingFacePanel compact />
                </Suspense>
              </div>
            </div>
          ) : (
            <>
              {searchOpen && (
                <div className="px-1 mt-1 mb-2">
                  <input
                    autoFocus
                    className="w-full ui-bg-elevated border ui-border rounded-lg px-3 py-2 text-sm ui-text-primary outline-none ui-input"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => {
                      if (!search) {
                        setSearchOpen(false);
                      }
                    }}
                  />
                </div>
              )}

              <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide ui-text-muted">
                Chats
              </div>

              {conversations.length === 0 && !search && (
                <div className="px-3 py-4 text-xs ui-text-muted">No conversations yet</div>
              )}

              {groups.map((group) => (
                <div key={group.label} className="mb-2">
                  <div className="px-3 py-1 text-[11px] ui-text-muted font-medium">
                    {group.label}
                  </div>
                  {group.items.map((conv) => (
                    <ConvItem
                      key={conv.id}
                      conv={conv}
                      isActive={conv.id === currentConversationId}
                      onSelect={() => {
                        setActiveView("chats");
                        return selectConversation(conv.id);
                      }}
                      onDelete={() => deleteConversation(conv.id)}
                      onRename={(title) => renameConversation(conv.id, title)}
                    />
                  ))}
                </div>
              ))}

              {search && filtered.length === 0 && (
                <div className="px-3 py-4 text-xs ui-text-muted">No results</div>
              )}
            </>
          )}
        </div>
      )}

      <div className={`border-t ui-border ${isCollapsed ? "px-1 py-2" : "px-3 py-3"}`}>
        {isCollapsed ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
            style={{ background: "var(--accent)" }}
            title="My Account"
          >
            <span className="text-xs font-bold" style={{ color: "var(--text-on-accent)" }}>
              M
            </span>
          </div>
        ) : (
          <div
            className="flex items-center gap-3 px-1 py-1.5 rounded-lg cursor-pointer transition-colors"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--accent)" }}
            >
              <span className="text-xs font-bold" style={{ color: "var(--text-on-accent)" }}>
                M
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium ui-text-primary truncate">My Account</span>
              <span className="text-xs ui-text-muted">Personal</span>
            </div>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize"
          onMouseDown={startResize}
          title="Drag to resize sidebar"
        />
      )}
    </aside>
  );
}
