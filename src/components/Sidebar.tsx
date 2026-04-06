import { formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { Edit2, MessageSquarePlus, MoreHorizontal, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { Conversation } from "../types";

function groupConversations(conversations: Conversation[]) {
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Last 30 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updated_at);
    if (isToday(date)) groups[0].items.push(conv);
    else if (isYesterday(date)) groups[1].items.push(conv);
    else if (isThisWeek(date)) groups[2].items.push(conv);
    else if (isThisMonth(date)) groups[3].items.push(conv);
    else groups[4].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

interface ConvItemProps {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

function ConvItem({ conv, isActive, onSelect, onDelete, onRename }: ConvItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conv.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleRenameSubmit = () => {
    if (renameValue.trim()) {
      onRename(renameValue.trim());
    }
    setRenaming(false);
  };

  return (
    <div
      className={`conv-item group relative flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer text-sm ${
        isActive
          ? "bg-[#2f2f2f] text-[#ececec]"
          : "text-[#ececec]/80 hover:bg-[#2a2a2a] hover:text-[#ececec]"
      }`}
      onClick={() => !renaming && onSelect()}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none text-[#ececec] text-sm"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") setRenaming(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{conv.title}</span>
      )}

      {!renaming && (
        <div className="conv-actions flex items-center gap-0.5 shrink-0" ref={menuRef}>
          <button
            className="p-1 rounded hover:bg-[#3f3f3f] text-[#8e8ea0] hover:text-[#ececec]"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 bg-[#2f2f2f] border border-[#3f3f3f] rounded-lg shadow-xl py-1 w-44">
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-[#ececec] hover:bg-[#3f3f3f]"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                <Edit2 size={13} />
                Rename
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 hover:bg-[#3f3f3f]"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
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
  } = useAppStore();

  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const groups = groupConversations(filtered);

  return (
    <aside className="flex flex-col w-64 shrink-0 bg-[#171717] h-screen select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#10a37f] to-[#7c3aed] flex items-center justify-center">
            <span className="text-white text-xs font-bold">S</span>
          </div>
          <span className="text-[#ececec] font-semibold text-sm">Singular Chat</span>
        </div>
        <button
          className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#8e8ea0] hover:text-[#ececec] transition-colors"
          onClick={() => createNewChat()}
          title="New chat"
        >
          <MessageSquarePlus size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-[#2a2a2a] rounded-lg px-3 py-1.5">
          <Search size={13} className="text-[#8e8ea0] shrink-0" />
          <input
            className="flex-1 bg-transparent text-[#ececec] text-sm placeholder-[#8e8ea0] outline-none"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[#8e8ea0] hover:text-[#ececec]">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.length === 0 && (
          <div className="text-center text-[#8e8ea0] text-sm py-8">
            {search ? "No results" : "No conversations yet"}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="px-2 py-1 text-xs text-[#8e8ea0] font-medium">{group.label}</div>
            {group.items.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === currentConversationId}
                onSelect={() => selectConversation(conv.id)}
                onDelete={() => deleteConversation(conv.id)}
                onRename={(title) => renameConversation(conv.id, title)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="px-2 py-2 border-t border-[#2a2a2a]">
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[#ececec]/80 hover:bg-[#2a2a2a] hover:text-[#ececec] transition-colors"
          onClick={() => setShowAssistants(true)}
        >
          <Sparkles size={15} className="text-[#10a37f]" />
          <span>Explore Assistants</span>
        </button>
        <button
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[#ececec]/80 hover:bg-[#2a2a2a] hover:text-[#ececec] transition-colors"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={15} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
