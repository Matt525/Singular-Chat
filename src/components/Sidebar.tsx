import {
  Edit,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  ChevronRight,
  Pin,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import type { Conversation } from "../types";
import { isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";

function groupConversations(conversations: Conversation[]) {
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Previous 30 days", items: [] },
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
    if (renaming) inputRef.current?.focus();
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

  const submitRename = () => {
    if (renameValue.trim()) onRename(renameValue.trim());
    setRenaming(false);
  };

  return (
    <div
      className={`conv-item group relative flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-sm ${
        isActive ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f5]"
      }`}
      onClick={() => !renaming && onSelect()}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none text-[#0d0d0d] text-sm"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate text-[#0d0d0d]">{conv.title}</span>
      )}

      {!renaming && (
        <div className="conv-actions flex items-center shrink-0" ref={menuRef}>
          <button
            className="p-1 rounded-md hover:bg-[#e5e5e5] text-[#6b6b6b] hover:text-[#0d0d0d]"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 bg-white border border-[#e5e5e5] rounded-xl shadow-lg py-1 w-44">
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-[#0d0d0d] hover:bg-[#f5f5f5]"
                onClick={(e) => { e.stopPropagation(); setRenaming(true); setMenuOpen(false); }}
              >
                <Edit size={13} /> Rename
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-500 hover:bg-[#f5f5f5]"
                onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
              >
                <Trash2 size={13} /> Delete
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
  const [searchOpen, setSearchOpen] = useState(false);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const groups = groupConversations(filtered);

  return (
    <aside className="flex flex-col w-[260px] shrink-0 bg-[#f9f9f9] h-screen select-none border-r border-[#e5e5e5]">
      {/* Top nav */}
      <div className="flex flex-col gap-0.5 px-2 pt-3 pb-1">
        {/* Logo row */}
        <div className="flex items-center justify-between px-1 mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#10a37f] to-[#7c3aed] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">S</span>
            </div>
          </div>
          <button
            className="p-1.5 rounded-lg hover:bg-[#ebebeb] text-[#6b6b6b] hover:text-[#0d0d0d] transition-colors"
            onClick={() => createNewChat()}
            title="New chat"
          >
            <Edit size={16} />
          </button>
        </div>

        {/* New chat */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[#0d0d0d] hover:bg-[#ebebeb] transition-colors"
          onClick={() => createNewChat()}
        >
          <Plus size={16} className="text-[#0d0d0d]" />
          <span>New chat</span>
        </button>

        {/* Search */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[#0d0d0d] hover:bg-[#ebebeb] transition-colors"
          onClick={() => setSearchOpen(!searchOpen)}
        >
          <Search size={16} className="text-[#0d0d0d]" />
          <span>Search chats</span>
        </button>

        {searchOpen && (
          <div className="px-1 mt-1">
            <input
              autoFocus
              className="w-full bg-white border border-[#e5e5e5] rounded-lg px-3 py-1.5 text-sm text-[#0d0d0d] placeholder-[#9b9b9b] outline-none focus:border-[#b0b0b0]"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => { if (!search) setSearchOpen(false); }}
            />
          </div>
        )}

        {/* More / Settings */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[#0d0d0d] hover:bg-[#ebebeb] transition-colors"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={16} className="text-[#0d0d0d]" />
          <span>Settings</span>
        </button>
      </div>

      {/* Assistants & sections */}
      <div className="px-3 pt-2 pb-1 space-y-0.5">
        <button
          className="flex items-center justify-between w-full py-1 text-xs text-[#6b6b6b] hover:text-[#0d0d0d] transition-colors"
          onClick={() => setShowAssistants(true)}
        >
          <span className="font-medium">Assistants</span>
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="mx-3 border-t border-[#e5e5e5] my-1" />

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && !search && (
          <div className="px-3 py-4 text-xs text-[#9b9b9b]">No conversations yet</div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="px-3 py-1 text-xs text-[#9b9b9b] font-medium">{group.label}</div>
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

        {search && filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-[#9b9b9b]">No results</div>
        )}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-[#e5e5e5]">
        <div className="flex items-center gap-3 px-1 py-1.5 rounded-lg hover:bg-[#ebebeb] cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#10a37f] to-[#7c3aed] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-[#0d0d0d] truncate">My Account</span>
            <span className="text-xs text-[#9b9b9b]">Personal</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
