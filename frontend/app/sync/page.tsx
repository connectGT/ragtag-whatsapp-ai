"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  Database,
  Key,
  FileCode,
  Play,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Upload,
  Layers,
  Terminal,
  Zap,
  MessageSquare,
  ShieldCheck,
  FileArchive,
  Loader2,
} from "lucide-react";

interface SyncStatus {
  backup_found: boolean;
  key_found: boolean;
  decrypted_db_ready: boolean;
  backup_directory: string;
  database_path?: string;
  chroma_path?: string;
  ollama_online?: boolean;
  active_model?: string;
  inference_mode?: string;
  user_name?: string;
  contacts_count: number;
  messages_count: number;
  tasks_count: number;
  vectors_count?: number;
}

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [logOutput, setLogOutput] = useState<string>("");
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // File import state
  const [rawTranscript, setRawTranscript] = useState<string>("");
  const [importChatName, setImportChatName] = useState<string>("");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // Feedback banner
  const [banner, setBanner] = useState<{ type: "success" | "info" | "error"; msg: string } | null>(null);

  // Real-time ZIP file upload & pipeline progress state
  const [zipUploadState, setZipUploadState] = useState<{
    fileName: string;
    fileSize: string;
    progress: number;
    phase: "uploading" | "processing" | "extracting" | "indexing" | "complete" | "error";
    statusText: string;
  } | null>(null);

  const appendLog = (msg: string, tag: "INFO" | "SUCCESS" | "TASK" | "ERROR" = "INFO") => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLogOutput((prev) => (prev ? `${prev}\n[${ts}] [${tag}] ${msg}` : `[${ts}] [${tag}] ${msg}`));
  };

  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logOutput]);

  const fetchStatus = () => {
    fetch("http://127.0.0.1:5000/api/status")
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    appendLog("RAGTAG engine connected. Ready to ingest WhatsApp chats.", "INFO");
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── File Upload (.txt or .zip) ─────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isZip = file.name.toLowerCase().endsWith(".zip");
    const isTxt = file.name.toLowerCase().endsWith(".txt");

    if (!isTxt && !isZip) {
      alert("Please upload a WhatsApp export file (.txt or .zip from WhatsApp Desktop).");
      return;
    }

    if (isZip) {
      const fileSizeStr =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
          : `${(file.size / 1024).toFixed(1)} KB`;

      appendLog(`ZIP archive detected: "${file.name}" (${fileSizeStr}). Initiating upload...`, "INFO");

      setZipUploadState({
        fileName: file.name,
        fileSize: fileSizeStr,
        progress: 0,
        phase: "uploading",
        statusText: "Uploading ZIP archive to local engine...",
      });
      setLoading(true);

      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "http://127.0.0.1:5000/api/upload");

      // Track byte-level upload progress (0% -> 95%)
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percentComplete = Math.min(95, Math.round((evt.loaded / evt.total) * 100));
          const loadedStr =
            evt.loaded > 1024 * 1024
              ? `${(evt.loaded / (1024 * 1024)).toFixed(2)} MB`
              : `${(evt.loaded / 1024).toFixed(0)} KB`;
          const totalStr =
            evt.total > 1024 * 1024
              ? `${(evt.total / (1024 * 1024)).toFixed(2)} MB`
              : `${(evt.total / 1024).toFixed(0)} KB`;

          setZipUploadState((prev) =>
            prev
              ? {
                  ...prev,
                  progress: percentComplete,
                  phase: "uploading",
                  statusText: `Uploading archive... ${percentComplete}% (${loadedStr} of ${totalStr})`,
                }
              : null
          );
        }
      };

      // Server-side processing simulation timers while backend unzips, ingests & extracts tasks
      let stageTimer1: any = null;
      let stageTimer2: any = null;

      xhr.upload.onload = () => {
        setZipUploadState((prev) =>
          prev
            ? {
                ...prev,
                progress: 96,
                phase: "processing",
                statusText: "Unpacking archive & ingesting messages into SQLite...",
              }
            : null
        );
        appendLog("ZIP uploaded. Unpacking archive & ingesting messages into ground truth SQLite...", "INFO");

        stageTimer1 = setTimeout(() => {
          setZipUploadState((prev) =>
            prev
              ? {
                  ...prev,
                  progress: 98,
                  phase: "extracting",
                  statusText: "Analyzing conversational context & extracting actionable tasks...",
                }
              : null
          );
          appendLog("Running task extraction pipeline with conversational thread resolution...", "INFO");
        }, 1200);

        stageTimer2 = setTimeout(() => {
          setZipUploadState((prev) =>
            prev
              ? {
                  ...prev,
                  progress: 99,
                  phase: "indexing",
                  statusText: "Synchronizing semantic vectors into ChromaDB...",
                }
              : null
          );
          appendLog("Embedding ingested messages into local ChromaDB collection...", "INFO");
        }, 3000);
      };

      xhr.onload = () => {
        clearTimeout(stageTimer1);
        clearTimeout(stageTimer2);
        setLoading(false);
        e.target.value = "";

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.status === "success") {
              setZipUploadState({
                fileName: file.name,
                fileSize: fileSizeStr,
                progress: 100,
                phase: "complete",
                statusText: `Completed! Ingested ${data.messages_added} messages, extracted ${data.tasks_extracted} tasks.`,
              });
              appendLog(
                `Done! ${data.messages_added} messages ingested, ${data.tasks_extracted} tasks extracted from "${file.name}".`,
                "SUCCESS"
              );
              setBanner({
                type: "success",
                msg: `Ingested ${data.messages_added} messages and extracted ${data.tasks_extracted} tasks from ${file.name}.`,
              });
              fetchStatus();
              // Keep success bar visible for 6 seconds
              setTimeout(() => {
                setZipUploadState(null);
              }, 6000);
            } else {
              setZipUploadState({
                fileName: file.name,
                fileSize: fileSizeStr,
                progress: 100,
                phase: "error",
                statusText: `Error: ${data.message || "Failed to process ZIP"}`,
              });
              appendLog(`Error: ${data.message}`, "ERROR");
              setBanner({ type: "error", msg: data.message });
            }
          } catch (err: any) {
            setZipUploadState({
              fileName: file.name,
              fileSize: fileSizeStr,
              progress: 100,
              phase: "error",
              statusText: `Failed to parse response: ${err.message}`,
            });
            appendLog(`Parse error: ${err.message}`, "ERROR");
          }
        } else {
          setZipUploadState({
            fileName: file.name,
            fileSize: fileSizeStr,
            progress: 100,
            phase: "error",
            statusText: `Upload failed with HTTP status ${xhr.status}`,
          });
          appendLog(`Upload failed with HTTP status ${xhr.status}`, "ERROR");
          setBanner({ type: "error", msg: `Upload failed (HTTP ${xhr.status}).` });
        }
      };

      xhr.onerror = () => {
        clearTimeout(stageTimer1);
        clearTimeout(stageTimer2);
        setLoading(false);
        e.target.value = "";
        setZipUploadState({
          fileName: file.name,
          fileSize: fileSizeStr,
          progress: 100,
          phase: "error",
          statusText: "Network error connecting to local RAGTAG backend (port 5000).",
        });
        appendLog("Network error during file upload.", "ERROR");
        setBanner({ type: "error", msg: "Network error connecting to backend API (port 5000)." });
      };

      xhr.send(formData);
      return;
    }

    // .txt — read and show in textarea for review before importing
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawTranscript(text);
      const guessedName = file.name.replace(/\.txt$/i, "").replace(/^WhatsApp Chat with\s*/i, "");
      if (guessedName) setImportChatName(guessedName);
      appendLog(`Loaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Review below then click Import.`, "INFO");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Parse & Import pasted/loaded .txt transcript ──────────────────────────
  const handleParseAndImportTranscript = async () => {
    if (!rawTranscript.trim()) {
      alert("Please paste or load a WhatsApp chat transcript first.");
      return;
    }

    setIsImporting(true);
    setImportProgress("Parsing transcript...");
    appendLog("Parsing WhatsApp chat transcript...", "INFO");

    const lineRegex = /^\[?(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]?(?:\s*-\s*|\s+)([^:]+):\s+(.*)$/;
    const lines = rawTranscript.split(/\r?\n/);
    const parsedMessages: Array<{ sender: string; content: string }> = [];
    let currentMsg: { sender: string; content: string } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(lineRegex);
      if (match) {
        if (currentMsg) parsedMessages.push(currentMsg);
        currentMsg = { sender: match[3].trim(), content: match[4].trim() };
      } else if (currentMsg) {
        currentMsg.content += "\n" + line;
      }
    }
    if (currentMsg) parsedMessages.push(currentMsg);

    if (parsedMessages.length === 0) {
      appendLog("Could not parse any messages. Check the format.", "ERROR");
      setBanner({ type: "error", msg: "No messages found. Make sure this is a WhatsApp exported .txt file." });
      setIsImporting(false);
      setImportProgress(null);
      return;
    }

    appendLog(`Parsed ${parsedMessages.length} messages. Ingesting...`, "INFO");
    let successCount = 0;
    let totalTasks = 0;

    for (let i = 0; i < parsedMessages.length; i++) {
      const m = parsedMessages[i];
      setImportProgress(`Ingesting ${i + 1} / ${parsedMessages.length}...`);
      try {
        const res = await fetch("http://127.0.0.1:5000/api/messages/inject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender_name: m.sender,
            chat_name: importChatName.trim() || "WhatsApp Group",
            content: m.content,
            mode: "auto",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          successCount++;
          totalTasks += data.tasks_extracted?.length || 0;
        }
      } catch {}
    }

    appendLog(`Import complete: ${successCount} messages, ${totalTasks} tasks extracted.`, "SUCCESS");
    setBanner({ type: "success", msg: `Imported ${successCount} messages and extracted ${totalTasks} tasks.` });
    setImportProgress(null);
    setIsImporting(false);
    setRawTranscript("");
    fetchStatus();
  };

  // ── Run Task Extractor ─────────────────────────────────────────────────────
  const handleTriggerTaskExtraction = async (forceReprocess: boolean = false) => {
    setLoading(true);
    appendLog(forceReprocess ? "Re-running task extraction with Ollama LLM..." : "Running task extraction on all stored messages...", "TASK");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/tasks/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_reprocess: forceReprocess, mode: forceReprocess ? "ollama" : "auto" }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        appendLog(`Done! Scanned: ${data.scanned_messages} msgs, New tasks: ${data.new_tasks_created}, Upgraded: ${data.tasks_upgraded}`, "SUCCESS");
        setBanner({ type: "success", msg: `Extracted ${data.new_tasks_created} new tasks from ${data.scanned_messages} messages.` });
        fetchStatus();
      } else {
        throw new Error(data.message || "Extraction failed");
      }
    } catch (err: any) {
      appendLog(`Task extraction failed: ${err.message}`, "ERROR");
      setBanner({ type: "error", msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Run Decryption (crypt15) ───────────────────────────────────────────────
  const handleRunDecryption = async () => {
    setLoading(true);
    appendLog("Running decryption pipeline (wadecrypt)...", "INFO");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/decrypt", { method: "POST" });
      const data = await res.json();
      appendLog(`Decryption: ${data.message}`, data.status === "success" ? "SUCCESS" : "ERROR");
      fetchStatus();
    } catch (err: any) {
      appendLog(`Decryption failed: ${err.message}`, "ERROR");
    } finally {
      setLoading(false);
    }
  };

  // ── Run Ingestion from backups/ ────────────────────────────────────────────
  const handleRunIngestion = async () => {
    setLoading(true);
    appendLog("Running ingestion from backups/ folder...", "INFO");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === "success") {
        appendLog(`Done! Source: ${data.source.split("\\").pop()} | Contacts: ${data.contacts_added} | Messages: ${data.messages_added} | Tasks: ${data.tasks_extracted}`, "SUCCESS");
        setBanner({ type: "success", msg: `Ingested ${data.messages_added} messages and extracted ${data.tasks_extracted} tasks.` });
      } else {
        appendLog(`Notice: ${data.message || JSON.stringify(data)}`, "INFO");
        setBanner({ type: "info", msg: data.message });
      }
      fetchStatus();
    } catch (err: any) {
      appendLog(`Ingestion failed: ${err.message}`, "ERROR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">

      {/* Header */}
      <div className="bg-white border border-gray-300 p-8 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-yellow-400 border border-black text-black">
              <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : ""}`} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              Data Sync Engine
            </h1>
          </div>
          <p className="text-sm text-gray-600 font-medium max-w-2xl">
            Import your WhatsApp chats, run ingestion, and extract action items — all processed locally on your machine.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 border border-gray-300 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-4 border flex items-center gap-3 ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-400 text-emerald-950"
              : banner.type === "error"
              ? "bg-rose-50 border-rose-400 text-rose-950"
              : "bg-blue-50 border-blue-400 text-blue-950"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : banner.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          ) : (
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
          )}
          <span className="text-xs font-mono font-bold">{banner.msg}</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-xs opacity-50 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* SECTION 1: Import WhatsApp Chat */}
      <div className="bg-white border border-gray-300 p-6 md:p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-black text-white">
                <Upload className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
                Import WhatsApp Chat
              </h2>
            </div>
            <p className="text-xs text-gray-500 font-mono">
              Upload a WhatsApp export from WhatsApp Desktop (.zip) or Android/iOS (.txt).
            </p>
          </div>

          <label className={`px-4 py-2 text-black border-2 border-black text-xs font-bold cursor-pointer flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[0.5px] active:translate-y-[0.5px] transition-all ${
            loading ? "bg-gray-200 opacity-60 cursor-not-allowed pointer-events-none" : "bg-yellow-400 hover:bg-yellow-500"
          }`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{loading ? "Processing ZIP..." : "Choose .txt or .zip"}</span>
            <input type="file" accept=".txt,.zip" onChange={handleFileUpload} disabled={loading} className="hidden" />
          </label>
        </div>

        {/* Real-time ZIP Upload & Ingestion Progress Bar */}
        {zipUploadState && (
          <div className="border-2 border-black p-5 bg-amber-50/70 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-4 transition-all">
            {/* Header: File info & status pill */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 border-2 border-black ${
                    zipUploadState.phase === "complete"
                      ? "bg-emerald-400 text-black"
                      : zipUploadState.phase === "error"
                      ? "bg-rose-500 text-white"
                      : "bg-yellow-400 text-black"
                  }`}
                >
                  <FileArchive className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-black uppercase tracking-wider">
                      {zipUploadState.fileName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-black text-white font-bold">
                      {zipUploadState.fileSize}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-gray-700 flex items-center gap-1.5 mt-0.5">
                    {zipUploadState.phase === "complete" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
                    ) : zipUploadState.phase === "error" ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 inline shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black inline shrink-0" />
                    )}
                    <span>{zipUploadState.statusText}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-mono font-black px-2.5 py-1 border border-black uppercase ${
                    zipUploadState.phase === "complete"
                      ? "bg-emerald-300 text-black"
                      : zipUploadState.phase === "error"
                      ? "bg-rose-100 text-rose-700 border-rose-600"
                      : "bg-black text-yellow-400"
                  }`}
                >
                  {zipUploadState.phase === "uploading" && "Uploading Archive"}
                  {zipUploadState.phase === "processing" && "Unpacking & Parsing"}
                  {zipUploadState.phase === "extracting" && "AI Task Extraction"}
                  {zipUploadState.phase === "indexing" && "ChromaDB Sync"}
                  {zipUploadState.phase === "complete" && "Ready / Ingested"}
                  {zipUploadState.phase === "error" && "Failed"}
                </span>
                <span className="text-sm font-mono font-black text-black">
                  {zipUploadState.progress}%
                </span>
                {zipUploadState.phase === "complete" && (
                  <button
                    onClick={() => setZipUploadState(null)}
                    className="p-1 hover:bg-black hover:text-white transition-colors text-black text-xs font-mono"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="w-full h-4 bg-white border-2 border-black p-0.5 overflow-hidden shadow-inner">
              <div
                className={`h-full transition-all duration-300 ${
                  zipUploadState.phase === "complete"
                    ? "bg-emerald-400"
                    : zipUploadState.phase === "error"
                    ? "bg-rose-500"
                    : "bg-yellow-400"
                }`}
                style={{
                  width: `${zipUploadState.progress}%`,
                  backgroundImage:
                    zipUploadState.phase !== "complete" && zipUploadState.phase !== "error"
                      ? "linear-gradient(45deg, rgba(0,0,0,0.18) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.18) 75%, transparent 75%, transparent)"
                      : "none",
                  backgroundSize: "20px 20px",
                }}
              />
            </div>

            {/* Ingestion Pipeline Stepper */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-300">
              <div
                className={`flex items-center gap-2 text-[10px] font-mono ${
                  zipUploadState.progress > 0 ? "font-bold text-black" : "text-gray-400"
                }`}
              >
                {zipUploadState.progress >= 95 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-black flex items-center justify-center text-[9px] font-bold">
                    1
                  </span>
                )}
                <span>1. Upload ZIP</span>
              </div>
              <div
                className={`flex items-center gap-2 text-[10px] font-mono ${
                  zipUploadState.progress >= 96 ? "font-bold text-black" : "text-gray-400"
                }`}
              >
                {zipUploadState.progress >= 98 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : zipUploadState.phase === "processing" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-gray-400 flex items-center justify-center text-[9px]">
                    2
                  </span>
                )}
                <span>2. SQLite Ingest</span>
              </div>
              <div
                className={`flex items-center gap-2 text-[10px] font-mono ${
                  zipUploadState.progress >= 98 ? "font-bold text-black" : "text-gray-400"
                }`}
              >
                {zipUploadState.progress >= 99 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : zipUploadState.phase === "extracting" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-gray-400 flex items-center justify-center text-[9px]">
                    3
                  </span>
                )}
                <span>3. Extract Tasks</span>
              </div>
              <div
                className={`flex items-center gap-2 text-[10px] font-mono ${
                  zipUploadState.progress >= 100 ? "font-bold text-emerald-700" : "text-gray-400"
                }`}
              >
                {zipUploadState.phase === "complete" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : zipUploadState.phase === "indexing" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-gray-400 flex items-center justify-center text-[9px]">
                    4
                  </span>
                )}
                <span>4. ChromaDB Vectors</span>
              </div>
            </div>
          </div>
        )}

        {/* How to export guide */}
        <div className="bg-gray-50 border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-mono font-bold text-gray-700 uppercase">How to export from WhatsApp</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600 font-mono">
            <div className="flex items-start gap-2">
              <span className="text-yellow-600 font-black shrink-0">Desktop:</span>
              <span>Open chat → ⋮ → More → Export chat → saves a .zip</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-yellow-600 font-black shrink-0">Android:</span>
              <span>Open chat → ⋮ → More → Export chat → Without Media → .txt</span>
            </div>
          </div>
        </div>

        {/* Paste transcript fallback */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                Group / Chat Name
              </label>
              <input
                type="text"
                value={importChatName}
                onChange={(e) => setImportChatName(e.target.value)}
                placeholder="e.g. Team RAGTAG Project Group"
                className="w-full px-3 py-2 border border-gray-300 text-xs font-mono bg-gray-50 focus:bg-white focus:border-black focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] text-gray-400 font-mono pb-1 leading-relaxed">
                Or paste the exported chat text below and click Import.
              </p>
            </div>
          </div>

          <textarea
            rows={4}
            value={rawTranscript}
            onChange={(e) => setRawTranscript(e.target.value)}
            placeholder={`Paste WhatsApp exported chat here...\ne.g. 30/10/2026, 14:30 - Prof. Sharma: Submit the SDMS files by Friday 5 PM.`}
            className="w-full p-3 border border-gray-300 text-xs font-mono bg-gray-50 focus:bg-white focus:border-black focus:outline-none"
          />

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleParseAndImportTranscript}
              disabled={isImporting || !rawTranscript.trim()}
              className={`py-2 px-5 text-xs font-bold uppercase tracking-wider border border-black flex items-center gap-2 transition-all duration-200 ${
                rawTranscript.trim() && !isImporting
                  ? "bg-black hover:bg-gray-800 text-white cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
              }`}
            >
              <Upload className={`w-3.5 h-3.5 ${isImporting ? "animate-pulse" : ""}`} />
              <span>{isImporting ? "Importing..." : "Import & Parse Transcript"}</span>
            </button>
            {importProgress && (
              <span className="text-xs font-mono text-emerald-700 animate-pulse">{importProgress}</span>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: Engine Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Task Extractor */}
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Task Extractor</span>
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-400 font-mono uppercase">
              {status?.inference_mode?.replace("_", " ") || "Auto"}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Scan stored messages and extract actionable tasks using local AI.
          </p>
          <div className="space-y-2 pt-1">
            <button
              onClick={() => handleTriggerTaskExtraction(false)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs font-bold bg-black hover:bg-gray-800 text-white border border-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Run Extraction</span>
            </button>
            <button
              onClick={() => handleTriggerTaskExtraction(true)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs font-bold bg-yellow-400 hover:bg-yellow-500 text-black border border-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              <span>Re-run with Ollama</span>
            </button>
          </div>
        </div>

        {/* Encrypted Backup / crypt15 */}
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Encrypted Backup</span>
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold font-mono uppercase ${
              status?.backup_found
                ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                : "bg-gray-100 text-gray-500 border border-gray-300"
            }`}>
              {status?.backup_found ? "Detected" : "Not Found"}
            </span>
          </div>
          <div className="space-y-2 text-xs font-mono text-gray-700">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5" /> crypt15 file:</span>
              <span className={`font-bold ${status?.backup_found ? "text-emerald-700" : "text-gray-400"}`}>
                {status?.backup_found ? "Found" : "Missing"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> Key file:</span>
              <span className={`font-bold ${status?.key_found ? "text-emerald-700" : "text-gray-400"}`}>
                {status?.key_found ? "Found" : "Missing"}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 font-mono leading-relaxed">
            Place <code className="bg-gray-100 px-1">msgstore.db.crypt15</code> and <code className="bg-gray-100 px-1">encrypted_backup.key</code> in the <code className="bg-gray-100 px-1">backend/backups/</code> folder, then decrypt.
          </p>
          <button
            onClick={handleRunDecryption}
            disabled={loading || !status?.backup_found || !status?.key_found}
            className={`w-full py-2 px-3 text-xs font-bold border border-black uppercase tracking-wider transition-all cursor-pointer ${
              status?.backup_found && status?.key_found
                ? "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed"
            }`}
          >
            Decrypt Backup
          </button>
        </div>

        {/* DB Status */}
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>Local Database</span>
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 font-mono uppercase">
              Active
            </span>
          </div>
          <div className="space-y-2 text-xs font-mono text-gray-700">
            {[
              { label: "Messages stored", value: status?.messages_count ?? "—" },
              { label: "Contacts", value: status?.contacts_count ?? "—" },
              { label: "Tasks extracted", value: status?.tasks_count ?? "—" },
              { label: "Vectors indexed", value: status?.vectors_count ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span>{label}:</span>
                <span className="font-bold text-gray-900">{value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleRunIngestion}
            disabled={loading}
            className="w-full py-2 px-3 text-xs font-bold bg-black hover:bg-gray-800 text-white border border-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
          >
            {loading ? "Processing..." : "Ingest from backups/"}
          </button>
        </div>
      </div>

      {/* SECTION 3: Ollama Status */}
      <div className="bg-white border border-gray-300 p-5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${status?.ollama_online ? "bg-emerald-500" : "bg-gray-300"}`} />
          <span className="text-xs font-mono font-bold text-gray-700 uppercase">
            Ollama LLM — {status?.ollama_online ? "Online" : "Offline"}
          </span>
        </div>
        {status?.ollama_online ? (
          <span className="text-xs font-mono text-emerald-700">
            Model: <strong>{status.active_model}</strong> — Neural task extraction active
          </span>
        ) : (
          <span className="text-xs font-mono text-gray-500">
            Run <code className="bg-gray-100 px-1">ollama pull llama3</code> then restart Flask to enable neural LLM mode.
          </span>
        )}
      </div>

      {/* SECTION 4: Execution Log */}
      <div className="bg-white border border-gray-300 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
            <Terminal className="w-4 h-4 text-black" />
            <span>Execution Log</span>
          </span>
          {logOutput && (
            <button
              onClick={() => setLogOutput("")}
              className="text-xs text-gray-400 hover:text-black font-mono cursor-pointer underline"
            >
              Clear
            </button>
          )}
        </div>
        <div
          ref={logTerminalRef}
          className="bg-gray-950 text-gray-200 font-mono text-xs p-4 border border-black min-h-[120px] max-h-[240px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed"
        >
          {logOutput || (
            <span className="text-gray-500">
              [SYSTEM] Standby. Upload a WhatsApp chat or click a button above to begin.
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
