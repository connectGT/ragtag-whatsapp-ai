"use client";

import React from "react";
import { ChatInterface } from "@/components/ChatInterface";
import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-300 p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-yellow-400 border border-black text-black">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
            Agentic Chat Workspace
          </h1>
        </div>
        <p className="text-sm text-gray-600 font-medium max-w-2xl">
          Offline Semantic Intelligence: Query your encrypted WhatsApp chat history with local zero-shot Llama 3 inference & ChromaDB vector embeddings.
        </p>
      </div>

      <ChatInterface />
    </div>
  );
}
