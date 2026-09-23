"use client";

import React from "react";
import { Settings as SettingsIcon, Database, Cpu, Sliders } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-300 p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-yellow-400 border border-black text-black">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
            System Settings
          </h1>
        </div>
        <p className="text-sm text-gray-600 font-medium max-w-2xl">
          Settings: Manage local SQLite database paths, ChromaDB vector embedding parameters, and Ollama local model configurations.
        </p>
      </div>

      <div className="bg-white border border-gray-300 p-8 space-y-6">
        <div className="space-y-2 pb-6 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <Database className="w-4 h-4 text-black" />
            <span>SQLite Storage Configuration</span>
          </h2>
          <p className="text-xs text-gray-500 font-mono">
            Database Path: backend/msgstore_ragtag.db
          </p>
        </div>

        <div className="space-y-2 pb-6 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <Cpu className="w-4 h-4 text-black" />
            <span>Local LLM Inference Engine</span>
          </h2>
          <p className="text-xs text-gray-500 font-mono">
            Ollama Model: Llama 3 8B (Q4_K_M) • GPU Device: RTX 5050
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <Sliders className="w-4 h-4 text-black" />
            <span>Vector Indexing Parameters</span>
          </h2>
          <p className="text-xs text-gray-500 font-mono">
            ChromaDB Chunk Size: 500 characters • Overlap: 50 characters
          </p>
        </div>
      </div>
    </div>
  );
}
