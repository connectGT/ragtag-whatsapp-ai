"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User,
  Search,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  CalendarPlus,
  MessageSquare,
  Users,
  MessageCircle,
  Zap,
  SlidersHorizontal,
  X,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Flame,
} from "lucide-react";

interface ChatItem {
  chat_name: string;
  message_count: number;
  is_group?: boolean;
  last_message?: {
    content: string;
    timestamp: string;
    date: string;
    sender_name: string;
  };
}

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  timestamp: string;
  date?: string;
  is_me?: boolean;
}

interface AgentResponse {
  id: string;
  type: "ai_answer" | "catchup" | "summary";
  title?: string;
  text: string;
  timestamp: string;
  chat_name?: string;
  action_items?: {
    task_name: string;
    due_date?: string;
    details?: string;
    sender_name?: string;
  }[];
}

/**
 * Build Google Calendar URL for 1-click reminders
 */
function buildGoogleCalendarUrl(
  taskName: string,
  dueDateStr: string,
  description: string
): string {
  let startDate: Date;
  try {
    startDate = new Date(dueDateStr.replace(" at ", " "));
    if (isNaN(startDate.getTime())) throw new Error("invalid");
  } catch {
    startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(9, 0, 0, 0);
  }
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/-|:|\.\d{3}/g, "").slice(0, 15) + "Z";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: taskName,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: description,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generate consistent avatar color based on name string
function getAvatarColor(name: string): string {
  const colors = [
    "bg-emerald-600 text-white",
    "bg-blue-600 text-white",
    "bg-amber-600 text-white",
    "bg-purple-600 text-white",
    "bg-rose-600 text-white",
    "bg-teal-600 text-white",
    "bg-indigo-600 text-white",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Helper to get initials
function getInitials(name: string): string {
  if (!name) return "WA";
  const clean = name.replace(/[^\w\s]/gi, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "WA";
}

// Detect if a chat message looks actionable
function isMessageActionable(text: string): boolean {
  const lower = text ? text.toLowerCase() : '';
  return (
    lower.includes("submit") ||
    lower.includes("upload") ||
    lower.includes("review") ||
    lower.includes("deadline") ||
    lower.includes("due") ||
    lower.includes("by tomorrow") ||
    lower.includes("by friday") ||
    lower.includes("before ") ||
    lower.includes("please ") ||
    lower.includes("make sure")
  );
}

export const ChatInterface: React.FC = () => {
  // Chat list state
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<string>("");
  const [chatSearch, setChatSearch] = useState<string>("");
  const [chatFilter, setChatFilter] = useState<"all" | "groups" | "direct">("all");

  // Stream state for selected chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Active view toggle: 'messages' (WhatsApp stream) vs 'agent' (AI analysis / catchup)
  const [viewMode, setViewMode] = useState<"messages" | "agent">("messages");

  // AI responses & query state
  const [agentResponses, setAgentResponses] = useState<AgentResponse[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Time-window modal state
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("last_24_hours");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat list
  const fetchChats = () => {
    fetch("http://127.0.0.1:5000/api/chats")
      .then((res) => res.json())
      .then((data: ChatItem[]) => {
        if (Array.isArray(data)) {
          setChats(data);
          if (data.length > 0 && !selectedChat) {
            setSelectedChat(data[0].chat_name);
          }
        }
      })
      .catch((err) => console.log("Failed to load chats:", err));
  };

  useEffect(() => {
    fetchChats();
  }, []);

  // When selected chat changes, fetch messages
  useEffect(() => {
    if (!selectedChat) return;

    setLoadingMessages(true);
    fetch(`http://127.0.0.1:5000/api/chats/${encodeURIComponent(selectedChat)}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages && Array.isArray(data.messages)) {
          const userSenderLower = "guru";
          const mapped: ChatMessage[] = data.messages.map((m: any) => ({
            id: m.id,
            sender_id: m.sender_id,
            sender_name: m.sender_name,
            content: m.content,
            timestamp: m.timestamp,
            date: m.date,
            is_me: (m.sender_name || "").toLowerCase().includes(userSenderLower),
          }));
          setMessages(mapped);
        } else {
          setMessages([]);
        }
      })
      .catch((err) => {
        console.error("Failed to load chat messages:", err);
        setMessages([]);
      })
      .finally(() => setLoadingMessages(false));
  }, [selectedChat]);

  // Scroll to bottom of message list
  useEffect(() => {
    if (viewMode === "messages") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, viewMode]);

  // Trigger Catch-Me-Up briefing for selected chat
  const handleTriggerCatchup = async () => {
    setViewMode("agent");
    setIsTyping(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/catchup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_name: selectedChat }),
      });
      const data = await res.json();

      // Extract tasks/mentions for calendar reminder cards
      const actionItems: { task_name: string; due_date?: string; details?: string }[] = [];
      if (Array.isArray(data.tasks_assigned)) {
        data.tasks_assigned.forEach((t: string) => {
          actionItems.push({
            task_name: t.replace(/^[\*\-\•]\s*/, "").slice(0, 70),
            details: t,
            due_date: "Tomorrow at 5 PM",
          });
        });
      }
      if (Array.isArray(data.urgent_mentions)) {
        data.urgent_mentions.forEach((m: string) => {
          actionItems.push({
            task_name: `Urgent Request: ${m.replace(/^[\*\-\•]\s*/, "").slice(0, 50)}`,
            details: m,
            due_date: "Today at 5 PM",
          });
        });
      }

      const newResp: AgentResponse = {
        id: Date.now().toString(),
        type: "catchup",
        title: `🚨 Catch-Me-Up Briefing: ${selectedChat}`,
        text: data.summary_text || "No recent messages found for this chat.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        chat_name: selectedChat,
        action_items: actionItems,
      };

      setAgentResponses((prev) => [newResp, ...prev]);
    } catch (err: any) {
      console.error("Catchup failed:", err);
    } finally {
      setIsTyping(false);
    }
  };

  // Trigger Time-Duration Summary
  const handleTriggerTimeSummary = async () => {
    setShowTimeModal(false);
    setViewMode("agent");
    setIsTyping(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_name: selectedChat,
          preset: selectedPreset,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      });
      const data = await res.json();

      const newResp: AgentResponse = {
        id: Date.now().toString(),
        type: "summary",
        title: `📅 Timeline Summary (${data.window_preset || "Selected Duration"}): ${selectedChat}`,
        text: data.summary_text || "No messages found in the selected time window.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        chat_name: selectedChat,
        action_items: (data.tasks_assigned || []).map((t: string) => ({
          task_name: t.replace(/^[\*\-\•]\s*/, "").slice(0, 70),
          details: t,
        })),
      };

      setAgentResponses((prev) => [newResp, ...prev]);
    } catch (err: any) {
      console.error("Summary failed:", err);
    } finally {
      setIsTyping(false);
    }
  };

  // Send query to AI RAG engine
  const handleSendQuery = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q) return;

    setInputQuery("");
    setViewMode("agent");
    setIsTyping(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, chat_name: selectedChat }),
      });
      const data = await res.json();

      const newResp: AgentResponse = {
        id: Date.now().toString(),
        type: "ai_answer",
        title: `💬 Question: "${q}"`,
        text: data.text || "No response received.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        chat_name: selectedChat,
        action_items: data.action_items || [],
      };

      setAgentResponses((prev) => [newResp, ...prev]);
    } catch (err) {
      console.error("Query failed:", err);
    } finally {
      setIsTyping(false);
    }
  };

  // Filter chats by search and category
  const filteredChats = chats.filter((c) => {
    const matchesSearch =
      c.chat_name.toLowerCase().includes(chatSearch.toLowerCase()) ||
      (c.last_message?.content || "").toLowerCase().includes(chatSearch.toLowerCase());
    if (!matchesSearch) return false;

    if (chatFilter === "groups") return c.is_group;
    if (chatFilter === "direct") return !c.is_group;
    return true;
  });

  return (
    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row h-[780px] overflow-hidden">
      {/* ── LEFT PANE: WHATSAPP CHAT LIST ────────────────────────── */}
      <div className="w-full md:w-80 lg:w-96 border-r-2 border-black flex flex-col bg-gray-50 shrink-0 h-full">
        {/* Profile & Header Bar */}
        <div className="p-4 bg-white border-b-2 border-black flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-yellow-400 border border-black flex items-center justify-center font-black text-xs text-black">
              GT
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 tracking-tight">WhatsApp Chats</h2>
              <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Local Air-Gapped Hub
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-black text-white">
            {chats.length} Chats
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-3 bg-white border-b border-gray-200 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search or start new chat..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 text-xs font-sans bg-gray-50 focus:bg-white focus:border-black focus:outline-none rounded-none"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 pt-1">
            {(["all", "groups", "direct"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setChatFilter(filter)}
                className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                  chatFilter === filter
                    ? "bg-black text-white border-black"
                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                }`}
              >
                {filter === "all" ? "All" : filter === "groups" ? "Groups" : "Direct"}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 bg-white">
          {filteredChats.length === 0 ? (
            <div className="p-8 text-center text-gray-500 space-y-2">
              <MessageCircle className="w-8 h-8 mx-auto text-gray-300" />
              <p className="text-xs font-mono">No chats matching &quot;{chatSearch}&quot;</p>
            </div>
          ) : (
            filteredChats.map((c) => {
              const isSelected = selectedChat === c.chat_name;
              return (
                <div
                  key={c.chat_name}
                  onClick={() => {
                    setSelectedChat(c.chat_name);
                    setViewMode("messages");
                  }}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all border-l-4 ${
                    isSelected
                      ? "bg-yellow-50 border-l-yellow-400"
                      : "hover:bg-gray-50 border-l-transparent"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-11 h-11 rounded-full shrink-0 flex items-center justify-center font-bold text-xs shadow-xs ${getAvatarColor(
                      c.chat_name
                    )}`}
                  >
                    {c.is_group ? <Users className="w-5 h-5" /> : getInitials(c.chat_name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h3
                        className="text-xs font-bold text-gray-900 truncate"
                        title={c.chat_name}
                      >
                        {c.chat_name}
                      </h3>
                      {c.last_message?.timestamp && (
                        <span className="text-[10px] text-gray-500 font-mono shrink-0">
                          {c.last_message.timestamp}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-500 truncate leading-snug font-sans">
                      {c.last_message?.sender_name && (
                        <span className="font-semibold text-gray-700">
                          {c.last_message.sender_name}:{" "}
                        </span>
                      )}
                      {c.last_message?.content || "Tap to inspect conversation"}
                    </p>
                  </div>

                  {/* Message count badge */}
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] font-mono font-bold rounded-full border border-emerald-300 shrink-0">
                    {c.message_count}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT PANE: ACTIVE CHAT CONVERSATION & AI AGENT ───────── */}
      <div className="flex-1 flex flex-col bg-white min-w-0 h-full">
        {/* Chat Header Bar */}
        <div className="p-4 bg-white border-b-2 border-black flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-xs ${getAvatarColor(
                selectedChat || "Chat"
              )}`}
            >
              {getInitials(selectedChat || "Chat")}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-gray-900 truncate">{selectedChat || "Select a Chat"}</h2>
              <p className="text-[11px] text-gray-500 font-mono">
                {messages.length} messages loaded • Ground-truth SQLite &amp; ChromaDB
              </p>
            </div>
          </div>

          {/* Action Toolbar Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center border border-black p-0.5 bg-gray-100 mr-1">
              <button
                onClick={() => setViewMode("messages")}
                className={`px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === "messages"
                    ? "bg-black text-white"
                    : "text-gray-700 hover:text-black"
                }`}
              >
                Chat Stream
              </button>
              <button
                onClick={() => setViewMode("agent")}
                className={`px-3 py-1 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  viewMode === "agent"
                    ? "bg-black text-white"
                    : "text-gray-700 hover:text-black"
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>AI Briefing</span>
              </button>
            </div>

            {/* Catch Me Up Button */}
            <button
              onClick={handleTriggerCatchup}
              disabled={isTyping}
              className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-black text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[0.5px] active:translate-y-[0.5px] cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 fill-black" />
              <span>Catch Me Up</span>
            </button>

            {/* Time Summary Modal Trigger */}
            <button
              onClick={() => setShowTimeModal(true)}
              className="px-3 py-1.5 bg-white hover:bg-gray-100 text-black border-2 border-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Time Summary</span>
            </button>
          </div>
        </div>

        {/* ── STREAM BODY ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#efeae2]/30 space-y-4">
          {viewMode === "messages" ? (
            /* WHATSAPP MESSAGE STREAM VIEW */
            loadingMessages ? (
              <div className="p-12 text-center text-gray-500 font-mono text-xs space-y-2">
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Loading messages for {selectedChat}...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="p-12 text-center text-gray-500 font-mono text-xs space-y-2">
                <MessageSquare className="w-8 h-8 text-gray-400 mx-auto" />
                <p>No messages stored for this chat yet.</p>
                <p className="text-[11px] text-gray-400">
                  Import a WhatsApp .zip export in the Sync tab to populate conversations.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-w-3xl mx-auto">
                {messages.map((m) => {
                  const actionable = isMessageActionable(m.content);
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.is_me ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[70%] p-3.5 rounded-lg shadow-xs border ${
                          m.is_me
                            ? "bg-[#dcf8c6] border-[#c0e8a7] text-gray-900 rounded-tr-none"
                            : "bg-white border-gray-200 text-gray-900 rounded-tl-none"
                        }`}
                      >
                        {/* Sender Name in group chat */}
                        {!m.is_me && (
                          <div className="text-[11px] font-bold text-teal-800 mb-1 font-sans">
                            {m.sender_name}
                          </div>
                        )}

                        {/* Content */}
                        <p className="text-xs font-sans leading-relaxed whitespace-pre-wrap select-text">
                          {m.content}
                        </p>

                        {/* Footer with Timestamp and Action Reminder */}
                        <div className="mt-2 pt-1 border-t border-black/5 flex items-center justify-between gap-3">
                          <span className="text-[10px] text-gray-500 font-mono">
                            {m.timestamp || m.date}
                          </span>

                          {/* Inline Reminder Button for Actionable Messages */}
                          {actionable && (
                            <button
                              onClick={() => {
                                const url = buildGoogleCalendarUrl(
                                  m.content.slice(0, 60),
                                  m.timestamp || "Tomorrow 5 PM",
                                  `From ${m.sender_name} in ${selectedChat}:\n\n"${m.content}"`
                                );
                                window.open(url, "_blank", "noopener,noreferrer");
                              }}
                              className="text-[10px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-sm flex items-center gap-1 cursor-pointer transition-colors"
                              title="Add reminder for this message in Google Calendar"
                            >
                              <CalendarPlus className="w-3 h-3 text-amber-800" />
                              <span>Set Reminder</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )
          ) : (
            /* AI AGENT RESPONSE & BRIEFING VIEW */
            <div className="space-y-4 max-w-3xl mx-auto">
              {isTyping && (
                <div className="bg-yellow-50 border-2 border-black p-4 flex items-center gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] animate-pulse">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-mono font-bold text-gray-900">
                    Ollama Local AI is synthesizing response for {selectedChat}...
                  </span>
                </div>
              )}

              {agentResponses.length === 0 && !isTyping ? (
                <div className="bg-white border-2 border-black p-8 text-center space-y-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <Sparkles className="w-8 h-8 text-yellow-500 mx-auto" />
                  <h3 className="text-sm font-black text-gray-900 uppercase">
                    AI Agent Briefing Ready
                  </h3>
                  <p className="text-xs text-gray-600 font-mono max-w-md mx-auto">
                    Click &quot;Catch Me Up&quot; above to generate a rapid executive summary, or ask
                    any question about &quot;{selectedChat}&quot; below.
                  </p>
                </div>
              ) : (
                agentResponses.map((resp) => (
                  <div
                    key={resp.id}
                    className="bg-white border-2 border-black p-5 md:p-6 space-y-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  >
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <span className="text-xs font-black text-gray-900 uppercase flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-black" />
                        <span>{resp.title || "AI Response"}</span>
                      </span>
                      <span className="text-[10px] font-mono text-gray-500">{resp.timestamp}</span>
                    </div>

                    {/* Markdown / text output */}
                    <div className="text-xs font-mono text-gray-800 leading-relaxed whitespace-pre-wrap select-text">
                      {resp.text}
                    </div>

                    {/* ACTION ITEMS REMINDER CARDS */}
                    {resp.action_items && resp.action_items.length > 0 && (
                      <div className="pt-3 border-t border-gray-200 space-y-2">
                        <span className="text-xs font-bold text-gray-900 uppercase flex items-center gap-1.5 font-mono">
                          <CalendarPlus className="w-3.5 h-3.5 text-black" />
                          <span>Detected Action Items — Add to Google Calendar</span>
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {resp.action_items.map((item, idx) => (
                            <div
                              key={idx}
                              className="bg-yellow-50 border border-black p-3 flex items-start justify-between gap-2 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                            >
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-gray-900 truncate">
                                  {item.task_name}
                                </h4>
                                <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                                  Due: {item.due_date || "Upcoming"}
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  const url = buildGoogleCalendarUrl(
                                    item.task_name,
                                    item.due_date || "Tomorrow 5 PM",
                                    item.details || `Extracted by RAGTAG AI from ${resp.chat_name}`
                                  );
                                  window.open(url, "_blank", "noopener,noreferrer");
                                }}
                                className="px-2.5 py-1 bg-yellow-400 hover:bg-yellow-500 text-black border border-black text-[11px] font-black uppercase tracking-wider shrink-0 cursor-pointer flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                              >
                                <span>Remind</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER: ASK AI ABOUT THIS CHAT ─────────────────────── */}
        <div className="p-3.5 bg-white border-t-2 border-black space-y-2">
          {/* Quick Query Chips */}
          <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-mono pb-1 scrollbar-none">
            <span className="text-gray-400 font-bold shrink-0">Ask:</span>
            {[
              `What tasks are due in ${selectedChat.slice(0, 15)}?`,
              `Summarize decisions in this chat`,
              `Did anyone mention submissions or links?`,
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendQuery(chip)}
                className="px-2.5 py-0.5 bg-gray-100 hover:bg-yellow-100 text-gray-800 border border-gray-300 hover:border-black shrink-0 cursor-pointer transition-colors rounded-none"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={`Ask local AI about ${selectedChat || "chats"}...`}
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="flex-1 px-3 py-2 border-2 border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={isTyping || !inputQuery.trim()}
              className="px-5 py-2 bg-black hover:bg-gray-800 text-white border-2 border-black text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[0.5px] active:translate-y-[0.5px] cursor-pointer disabled:opacity-50"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* ── TIME-DURATION SUMMARY MODAL ───────────────────────────── */}
      {showTimeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black p-6 max-w-md w-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-black" />
                <span>Time-Duration Summary</span>
              </h3>
              <button
                onClick={() => setShowTimeModal(false)}
                className="p-1 hover:bg-gray-100 border border-transparent hover:border-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 font-mono">
              Generate a structured AI synthesis for <strong>{selectedChat}</strong> across a specific timeframe.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono font-bold text-gray-700 uppercase block mb-1.5">
                  Select Time Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "last_2_hours", label: "Past 2 Hours" },
                    { id: "last_24_hours", label: "Past 24 Hours" },
                    { id: "last_7_days", label: "Past 7 Days" },
                    { id: "all", label: "All Time" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPreset(p.id)}
                      className={`p-2 text-xs font-bold font-mono border text-center cursor-pointer transition-all ${
                        selectedPreset === p.id
                          ? "bg-yellow-400 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black"
                          : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTimeModal(false)}
                  className="px-4 py-2 border border-gray-300 text-xs font-bold hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTriggerTimeSummary}
                  className="px-5 py-2 bg-black hover:bg-gray-800 text-white border border-black text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                >
                  Generate Summary
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
