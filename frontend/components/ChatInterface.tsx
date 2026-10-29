"use client";

import React, { useState } from "react";
import { Send, Bot, User, Database, Terminal, Zap } from "lucide-react";

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

  const sampleQueries = [
    "What tasks are due this Friday?",
    "Summarize project discussions with Prof. Sharma",
    "Did anyone ask about SDMS portal files?",
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
      text: "⚡ Emergency Catch-Me-Up: Give me an executive summary of the latest unread group messages before my call.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/catchup" + (chatName ? `?chat_name=${encodeURIComponent(chatName)}` : ""));
      const data = await res.json();

      let briefingText = "";
      if (data.briefing_markdown) {
        briefingText = data.briefing_markdown;
      } else if (data.tldr) {
        briefingText = `### ⚡ Emergency Catch-Me-Up Briefing: **${data.chat_name}**\n` +
          `*Timeline: ${data.timeline} (${data.message_count} messages analyzed)*\n\n` +
          `**👥 Active Participants:** ${data.participants ? data.participants.join(", ") : "Team"}\n\n` +
          `**🔥 Executive TL;DR:**\n` +
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
        briefingText = data.error || "No messages available to summarize.";
      }

      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: briefingText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-5xl mx-auto bg-white border border-gray-300 shadow-sm overflow-hidden">
      {/* Top Console Bar */}
      <div className="px-8 py-3.5 bg-gray-900 text-white border-b border-gray-900 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-yellow-400 border border-black" />
          <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-gray-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-yellow-400" />
            <span>Agentic Chatbot Workspace</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleCatchUp()}
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-bold border border-black shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] flex items-center gap-1.5 transition-all cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Zap className="w-3.5 h-3.5 fill-black" />
            <span>⚡ Catch Me Up (Unread Briefing)</span>
          </button>
          <span className="text-xs font-mono text-gray-400 hidden sm:inline">Offline Local Inference</span>
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
    </div>
  );
};
