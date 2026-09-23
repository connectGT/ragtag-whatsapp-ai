"use client";

import React from "react";
import { X, Database, ShieldCheck } from "lucide-react";
import { ContextMessage } from "./TaskCard";

interface ContextModalProps {
  message: ContextMessage | null;
  onClose: () => void;
}

export const ContextModal: React.FC<ContextModalProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-xl border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="px-6 py-4 bg-black text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Ground Truth Context Trace
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 bg-white">
          <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-300 text-xs">
            <div>
              <span className="text-gray-500 font-mono block mb-0.5">MESSAGE_ID:</span>
              <span className="font-mono font-bold text-gray-900 select-all">{message.id}</span>
            </div>
            <div>
              <span className="text-gray-500 font-mono block mb-0.5">CHAT_NAME:</span>
              <span className="font-bold text-gray-900">{message.chat_name}</span>
            </div>
            <div>
              <span className="text-gray-500 font-mono block mb-0.5">SENDER:</span>
              <span className="font-bold text-gray-900">{message.sender_name}</span>
            </div>
            <div>
              <span className="text-gray-500 font-mono block mb-0.5">TIMESTAMP:</span>
              <span className="font-mono text-gray-900">{message.timestamp}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Original Decrypted WhatsApp Message:
            </span>
            <div className="p-4 bg-emerald-50 border-2 border-emerald-600 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-900">
                  ~ {message.sender_name}
                </span>
                <span className="text-[10px] font-mono text-emerald-700">{message.timestamp}</span>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed font-sans">
                {message.content}
              </p>
            </div>
          </div>

          <div className="p-3 bg-yellow-50 border border-yellow-400 text-xs text-yellow-900 flex items-center justify-between font-mono">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-black" />
              <span>Verified SQLite Row Entry • Edge Computed</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-gray-100 border-t border-gray-300 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Close Trace
          </button>
        </div>
      </div>
    </div>
  );
};
