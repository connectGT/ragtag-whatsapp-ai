"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw, Database, Key, FileCode, Play, CheckCircle2, AlertCircle } from "lucide-react";

interface SyncStatus {
  backup_found: boolean;
  key_found: boolean;
  decrypted_db_ready: boolean;
  backup_directory: string;
  contacts_count: number;
  messages_count: number;
  tasks_count: number;
}

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [logOutput, setLogOutput] = useState<string>("");

  const fetchStatus = () => {
    fetch("http://127.0.0.1:5000/api/status")
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch((err) => {
        console.error("Failed to connect to backend API:", err);
      });
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRunDecryption = async () => {
    setLoading(true);
    setLogOutput("Executing Phase 1: Local Decryption Pipeline (wadecrypt)...");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/decrypt", { method: "POST" });
      const data = await res.json();
      setLogOutput(data.message + (data.logs ? `\n\n${data.logs}` : "") + (data.error_logs ? `\n\n${data.error_logs}` : ""));
      fetchStatus();
    } catch (err: any) {
      setLogOutput("Decryption failed to trigger: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunIngestion = async () => {
    setLoading(true);
    setLogOutput("Executing Phase 2: Ingestion & Relational Bridge (ingest.py)...");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === "success") {
        setLogOutput(
          `[SUCCESS] Ingestion Complete!\n- Source: ${data.source}\n- Contacts Added: ${data.contacts_added}\n- Messages Ingested: ${data.messages_added}\n- Total Parsed: ${data.total_parsed}`
        );
      } else {
        setLogOutput(`[INFO] ${data.message || JSON.stringify(data)}`);
      }
      fetchStatus();
    } catch (err: any) {
      setLogOutput("Ingestion failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-gray-300 p-8 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-yellow-400 border border-black text-black">
              <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : ""}`} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              WhatsApp Data Ingestion Engine
            </h1>
          </div>
          <p className="text-sm text-gray-600 font-medium max-w-2xl">
            Offline Privacy Pipeline: Decrypt .crypt15 backups or parse exported chats into SQLite ground-truth and sync to ChromaDB.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 border border-gray-300 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh State</span>
        </button>
      </div>

      {/* Grid of Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Backup Files Card */}
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">Encrypted Backup</span>
            <span
              className={`px-2 py-0.5 text-xs font-bold ${
                status?.backup_found
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                  : "bg-gray-100 text-gray-600 border border-gray-300"
              }`}
            >
              {status?.backup_found ? "Detected" : "Waiting for Sync"}
            </span>
          </div>
          <div className="space-y-2 text-xs font-mono text-gray-700">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5" /> msgstore.db.crypt15:</span>
              <span className="font-bold">{status?.backup_found ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> backup key:</span>
              <span className="font-bold">{status?.key_found ? "Yes" : "No"}</span>
            </div>
          </div>
          <button
            onClick={handleRunDecryption}
            disabled={loading || !status?.backup_found || !status?.key_found}
            className={`w-full py-2.5 px-4 text-xs font-bold border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              status?.backup_found && status?.key_found
                ? "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed"
            }`}
          >
            Run Decrypt (Phase 1)
          </button>
        </div>

        {/* SQLite Database Card */}
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">SQLite Ground Truth</span>
            <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-400">
              Active
            </span>
          </div>
          <div className="space-y-2 text-xs font-mono text-gray-700">
            <div className="flex items-center justify-between">
              <span>Messages Stored:</span>
              <span className="font-bold text-gray-900">{status?.messages_count ?? "..."}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Contacts Registered:</span>
              <span className="font-bold text-gray-900">{status?.contacts_count ?? "..."}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tasks Grounded:</span>
              <span className="font-bold text-gray-900">{status?.tasks_count ?? "..."}</span>
            </div>
          </div>
          <button
            onClick={handleRunIngestion}
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-bold bg-black hover:bg-gray-800 text-white border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]"
          >
            {loading ? "Processing..." : "Run Ingest & Index"}
          </button>
        </div>

        {/* Pipeline Info Card */}
        <div className="bg-white border border-gray-300 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">Ingest Sources</span>
            <span className="px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-900 border border-yellow-400">
              Dual-Mode
            </span>
          </div>
          <h2 className="text-sm font-bold text-gray-900">Supported Formats</h2>
          <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside font-mono">
            <li>Decrypted <code className="bg-gray-100 px-1 py-0.5">msgstore.db</code></li>
            <li>Exported <code className="bg-gray-100 px-1 py-0.5">.txt</code> chat logs</li>
            <li>Sample test in <code className="bg-gray-100 px-1 py-0.5">backups/</code></li>
          </ul>
          <p className="text-[11px] text-gray-500 pt-2 border-t border-gray-100">
            Files in <code className="font-mono text-gray-700">backend/backups</code> are automatically ingested.
          </p>
        </div>
      </div>

      {/* Terminal / Logs Console */}
      <div className="bg-white border border-gray-300 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
            <Database className="w-4 h-4 text-black" />
            <span>Pipeline Execution Console</span>
          </span>
          {logOutput && (
            <button
              onClick={() => setLogOutput("")}
              className="text-xs text-gray-500 hover:text-black font-mono cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
        <div className="bg-gray-950 text-gray-200 font-mono text-xs p-4 border border-black min-h-[120px] max-h-[240px] overflow-y-auto whitespace-pre-wrap">
          {logOutput || (
            <span className="text-gray-500">
              Ready. Click &quot;Run Ingest &amp; Index&quot; to parse chats into SQLite ground truth.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
