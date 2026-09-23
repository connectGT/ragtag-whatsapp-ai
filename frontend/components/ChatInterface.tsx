"use client";

import React, { useState } from "react";
import { Send, Bot, User, Database, Terminal } from "lucide-react";

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

  const handleSend = (textToSend?: string) => {
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

    setTimeout(() => {
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: `Indexed SQLite truth database and ChromaDB vector embeddings for query: "${query}". Retrieved matching context entry from encrypted storage.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: [
          {
            chat_name: "RAGTAG Project Group",
            sender_name: "Guru Tiwari",
            timestamp: "Sep 23, 2026 09:15",
            snippet: "Eshanya, please finish the Next.js UI mockups by tomorrow night.",
          },
        ],
      };
      setMessages((prev) => [...prev, agentMsg]);
      setIsTyping(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-5xl mx-auto bg-white border border-gray-300 shadow-sm overflow-hidden">
      <div className="px-8 py-4 bg-gray-900 text-white border-b border-gray-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-yellow-400 border border-black" />
          <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-gray-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-yellow-400" />
            <span>Agentic Chatbot Workspace</span>
          </h2>
        </div>
        <span className="text-xs font-mono text-gray-400">Offline Local Inference</span>
      </div>

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

            <div className="space-y-3">
              <div
                className={`p-5 text-sm leading-relaxed transition-all duration-200 ${
                  msg.sender === "user"
                    ? "bg-white text-gray-900 border border-gray-300 shadow-xs"
                    : "bg-white border-l-4 border-l-yellow-400 border-y border-r border-gray-300 text-gray-900 shadow-xs"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                <div className="text-[11px] mt-3 text-right font-mono text-gray-400">
                  {msg.timestamp}
                </div>
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="p-4 bg-white border border-gray-300 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-gray-900 uppercase">
                    <Database className="w-4 h-4 text-yellow-600" />
                    <span>Ground Truth Source Citations:</span>
                  </div>
                  {msg.sources.map((src, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 border border-gray-200 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-gray-900">
                        <span>Chat: {src.chat_name}</span>
                        <span className="font-mono text-gray-500">{src.timestamp}</span>
                      </div>
                      <p className="text-gray-700 italic font-serif leading-relaxed">&ldquo;{src.snippet}&rdquo;</p>
                      <span className="text-[11px] text-gray-500 block font-mono">— {src.sender_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-4 mr-auto items-center text-xs text-gray-600">
            <div className="w-9 h-9 bg-yellow-400 text-black font-bold flex items-center justify-center border border-black">
              <Bot className="w-4.5 h-4.5 animate-spin" />
            </div>
            <div className="p-4 bg-white border border-gray-300 font-mono text-xs text-gray-700">
              Searching vector embeddings locally in ChromaDB...
            </div>
          </div>
        )}
      </div>

      <div className="px-8 py-3 bg-white border-t border-gray-200 flex items-center gap-3 overflow-x-auto">
        <span className="text-xs font-mono font-bold text-gray-500 shrink-0 uppercase">Query Prompts:</span>
        {sampleQueries.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            className="px-3.5 py-1.5 text-xs bg-gray-100 hover:bg-yellow-100 hover:border-yellow-400 text-gray-800 hover:text-black border border-gray-300 transition-all duration-200 whitespace-nowrap font-medium cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="p-6 bg-gray-100 border-t border-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-4"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Type your semantic query to local Llama 3..."
            className="flex-1 px-5 py-3.5 bg-white border border-gray-300 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-black transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim()}
            className="px-6 py-3.5 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 disabled:text-gray-500 text-black font-bold text-xs uppercase tracking-wider border border-black flex items-center gap-2 transition-all duration-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
