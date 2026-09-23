"use client";

import React from "react";
import { RefreshCw } from "lucide-react";

export default function SyncPage() {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-300 p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-yellow-400 border border-black text-black">
            <RefreshCw className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
            Data Sync Engine
          </h1>
        </div>
        <p className="text-sm text-gray-600 font-medium max-w-2xl">
          Data Sync: Monitor local WhatsApp .crypt15 decryption status, local Wi-Fi backup syncing, and SQLite relational ground-truth state.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-300 p-8 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">Backup Status</span>
            <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-400">
              Synced
            </span>
          </div>
          <h2 className="text-base font-bold text-gray-900">msgstore.db.crypt15 Sync</h2>
          <p className="text-xs text-gray-600 font-mono">
            Local Wi-Fi auto-sync active • Decryption engine ready
          </p>
        </div>

        <div className="bg-white border border-gray-300 p-8 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">Database Health</span>
            <span className="px-2.5 py-1 text-xs font-bold bg-yellow-100 text-yellow-900 border border-yellow-400">
              msgstore_ragtag.db
            </span>
          </div>
          <h2 className="text-base font-bold text-gray-900">SQLite Relational Store</h2>
          <p className="text-xs text-gray-600 font-mono">
            Ground Truth Table Integrity: 100% Verified
          </p>
        </div>
      </div>
    </div>
  );
}
