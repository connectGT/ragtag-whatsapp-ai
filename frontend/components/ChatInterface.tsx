"use client";

import React, { useState, useEffect } from "react";
import { Send, Bot, User, Database, Terminal, Zap, Calendar, Clock, SlidersHorizontal, X } from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  sources?: {
    chat_name: string;
    sender_name: string;
    timestamp: string;
    snippet: string;
  }[];
}

interface ChatGroup {
  chat_name: string;
  message_count: number;
}

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "user",
      text: "What did the team decide about the presentation topic last week?",
      timestamp: "10:14 AM",
    },
    {
      id: "2",
      sender: "agent",
      text: "Based on local semantic search in ChromaDB, the team decided to focus the presentation on 'Edge-Computed Privacy-First WhatsApp Task Extraction & RAG'.\n\nGuru Tiwari proposed this topic on Sep 18, and Eshanya Bhaiji approved it.",
      timestamp: "10:14 AM",
      sources: [
        {
          chat_name: "RAGTAG Core Devs",
          sender_name: "Guru Tiwari",
          timestamp: "Sep 18, 2026 16:45",
          snippet: "Should we present the dual-brain architecture (SQLite + ChromaDB) for the project showcase?",
        },
        {
          chat_name: "RAGTAG Core Devs",
          sender_name: "Eshanya Bhaiji",
          timestamp: "Sep 18, 2026 16:50",
          snippet: "Yes! Edge-computed privacy with local Llama 3 will impress everyone.",
        },
      ],
    },
  ]);

  const [inputQuery, setInputQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Time-Window Summary Modal state
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [chats, setChats] = useState<ChatGroup[]>([]);
  const [selectedChat, setSelectedChat] = useState<string>("all");
  const [selectedPreset, setSelectedPreset] = useState<string>("last_24_hours");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/chats")
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch((err) => console.log("Failed to load chat list:", err));
  }, []);

  const sampleQueries = [
    "What tasks are due this week?",
    "Summarize our latest project discussions",
    "What action items are currently pending?",
  ];

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || inputQuery;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setIsTyping(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: data.text || "No relevant messages found.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: "Failed to connect to local ChromaDB backend: " + err.message,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCatchUp = async (chatName?: string) => {
    setIsTyping(true);
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: "⚡ Emergency Catch-Me-Up: Give me an executive briefing of recent missed messages.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/catchup" + (chatName ? `?chat_name=${encodeURIComponent(chatName)}` : ""));
      const data = await res.json();
      renderSummaryResult(data);
    } catch (err: any) {
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: "Failed to generate emergency briefing: " + err.message,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleRunTimelineSummary = async () => {
    setShowTimeModal(false);
    setIsTyping(true);

    const presetLabels: Record<string, string> = {
      last_2_hours: "Last 2 Hours",
      last_24_hours: "Last 24 Hours",
      last_7_days: "Last 7 Days",
      all: "All Time",
      custom: `Custom Range (${startDate || "Start"} to ${endDate || "Now"})`,
    };

    const targetChat = selectedChat === "all" ? "All Chats" : selectedChat;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: `📅 Generate Timeline Summary for **${targetChat}** [Duration: ${presetLabels[selectedPreset] || selectedPreset}]`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_name: selectedChat === "all" ? null : selectedChat,
          preset: selectedPreset,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });
      const data = await res.json();
      renderSummaryResult(data);
    } catch (err: any) {
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: "Failed to generate timeline summary: " + err.message,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderSummaryResult = (data: any) => {
    let briefingText = "";
    if (data.briefing_markdown) {
      briefingText = data.briefing_markdown;
    } else if (data.tldr) {
      briefingText = `### 📊 Timeline Summary: **${data.title || data.chat_name}**\n` +
        `*Timeline: ${data.timeline} (${data.message_count} messages analyzed)*\n\n` +
        `**👥 Active Participants:** ${data.participants ? data.participants.join(", ") : "Team"}\n\n` +
        `**🔥 Executive Overview:**\n` +
        data.tldr.map((t: string) => `• ${t}`).join("\n") + "\n\n";

      if (data.decisions && data.decisions.length > 0) {
        briefingText += `**📌 Decisions Made:**\n` +
          data.decisions.map((d: string) => `• ${d}`).join("\n") + "\n\n";
      }

      if (data.actions && data.actions.length > 0) {
        briefingText += `**⚠️ Action Items & Deadlines:**\n` +
          data.actions.map((a: string) => `• ${a}`).join("\n") + "\n\n";
      }

      if (data.mentions_for_user && data.mentions_for_user.length > 0) {
        briefingText += `**👤 Directly Mentioning You:**\n` +
          data.mentions_for_user.map((m: string) => `• ${m}`).join("\n");
      }
    } else {
      briefingText = data.error || "No messages found in that time window.";
    }

    const agentMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      sender: "agent",
      text: briefingText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, agentMsg]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-5xl mx-auto bg-white border border-gray-300 shadow-sm overflow-hidden relative">
      {/* Top Console Bar */}
      <div className="px-8 py-3.5 bg-gray-900 text-white border-b border-gray-900 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-yellow-400 border border-black" />
          <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-gray-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-yellow-400" />
            <span>Agentic Chatbot Workspace</span>
          </h2>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowTimeModal(true)}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold border border-gray-600 flex items-center gap-1.5 transition-all cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span>Time-Duration Summary</span>
          </button>
          <button
            onClick={() => handleCatchUp()}
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-bold border border-black shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] flex items-center gap-1.5 transition-all cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Zap className="w-3.5 h-3.5 fill-black" />
            <span>⚡ Catch Me Up (100+ Unread)</span>
          </button>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/60">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-4 max-w-3xl ${
              msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            <div
              className={`w-9 h-9 flex items-center justify-center shrink-0 text-xs font-bold border transition-transform duration-200 ${
                msg.sender === "user"
                  ? "bg-black text-white border-black"
                  : "bg-yellow-400 text-black border-black"
              }`}
            >
              {msg.sender === "user" ? <User className="w-4.5 h-4.5" /> : <Bot className="w-4.5 h-4.5" />}
            </div>

            <div
              className={`flex flex-col space-y-2 ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`p-5 text-sm leading-relaxed border transition-all duration-200 ${
                  msg.sender === "user"
                    ? "bg-black text-white border-black shadow-xs font-medium"
                    : "bg-white text-gray-900 border-gray-300 shadow-xs"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-gray-200/80 space-y-3">
                    <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-gray-500 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-black" />
                      <span>Retrieved Context Provenance:</span>
                    </span>
                    <div className="grid grid-cols-1 gap-2.5">
                      {msg.sources.map((src, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-50 border border-gray-200 p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-gray-600 font-mono text-[11px]">
                            <span className="font-bold text-black">{src.chat_name}</span>
                            <span>{src.timestamp}</span>
                          </div>
                          <p className="text-gray-800 italic">&ldquo;{src.snippet}&rdquo;</p>
                          <span className="text-[10px] text-gray-500 font-mono block">
                            Sender: {src.sender_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span className="text-[10px] font-mono text-gray-600 px-1 font-semibold">
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-4 items-center mr-auto">
            <div className="w-9 h-9 flex items-center justify-center bg-yellow-400 border border-black text-black">
              <Bot className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <div className="p-4 bg-white border border-gray-300 text-xs font-mono text-gray-600 flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-400 border border-black animate-ping" />
              <span>Scanning local ChromaDB and SQLite truth engine...</span>
            </div>
          </div>
        )}
      </div>

      {/* Query Bar */}
      <div className="p-6 bg-white border-t border-gray-300 space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-mono text-gray-600 shrink-0 font-bold">Suggested:</span>
          {sampleQueries.map((query, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(query)}
              className="text-xs bg-gray-100 hover:bg-yellow-50 text-gray-700 hover:text-black border border-gray-300 px-3 py-1.5 shrink-0 transition-colors duration-150 cursor-pointer font-medium"
            >
              &ldquo;{query}&rdquo;
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask anything about your decrypted group chats..."
            className="flex-1 bg-white border border-gray-300 px-4 py-3 text-sm focus:outline-hidden focus:border-black transition-colors"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isTyping}
            className="px-6 py-3 bg-black text-white hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Time-Window Summary Modal */}
      {showTimeModal && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-black p-6 max-w-lg w-full shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-yellow-400 border border-black">
                  <Clock className="w-4 h-4 text-black" />
                </div>
                <h3 className="font-bold text-base text-gray-900 uppercase tracking-tight">
                  Time-Duration Chat Summary
                </h3>
              </div>
              <button
                onClick={() => setShowTimeModal(false)}
                className="p-1 hover:bg-gray-100 border border-transparent hover:border-gray-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Chat Selector */}
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1.5">Select Chat Group:</label>
                <select
                  value={selectedChat}
                  onChange={(e) => setSelectedChat(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 p-2.5 font-sans text-xs focus:border-black focus:outline-hidden"
                >
                  <option value="all">All Group Chats (Full Workspace)</option>
                  {chats.map((c) => (
                    <option key={c.chat_name} value={c.chat_name}>
                      {c.chat_name} ({c.message_count} messages)
                    </option>
                  ))}
                </select>
              </div>

              {/* Preset Selector */}
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1.5">Time Duration Preset:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "last_2_hours", label: "🕒 Last 2 Hours" },
                    { id: "last_24_hours", label: "📅 Last 24 Hours" },
                    { id: "last_7_days", label: "📆 Last 7 Days" },
                    { id: "all", label: "🗓️ All Time" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPreset(p.id)}
                      className={`p-2.5 text-left border transition-all cursor-pointer font-sans text-xs ${
                        selectedPreset === p.id
                          ? "bg-yellow-400 border-black font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range Toggle */}
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedPreset("custom")}
                  className={`text-xs font-bold uppercase tracking-wider cursor-pointer mb-2 flex items-center gap-1.5 ${
                    selectedPreset === "custom" ? "text-black" : "text-gray-500 hover:text-black"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Or Define Custom Date Range</span>
                </button>

                {selectedPreset === "custom" && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">Start Date/Time:</span>
                      <input
                        type="datetime-local"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 p-2 text-xs font-sans focus:border-black focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">End Date/Time:</span>
                      <input
                        type="datetime-local"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 p-2 text-xs font-sans focus:border-black focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowTimeModal(false)}
                className="px-4 py-2 border border-gray-300 text-xs font-bold hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunTimelineSummary}
                className="px-5 py-2 bg-black hover:bg-gray-800 text-white border border-black text-xs font-bold uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                Generate Briefing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
