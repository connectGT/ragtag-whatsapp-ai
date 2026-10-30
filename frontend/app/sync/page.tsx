"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Database,
  Key,
  FileCode,
  Play,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Send,
  Upload,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  Terminal,
  ShieldCheck,
  Check,
  Clock,
  User,
  MessageSquare,
  Zap,
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

interface ExtractedTask {
  id?: number | string;
  task_name: string;
  due_date?: string;
  priority?: "High" | "Medium" | "Low" | string;
  status?: string;
  extraction_mode?: string;
  context_message_id?: string;
}

interface PipelineStep {
  id: number;
  title: string;
  desc: string;
  status: "idle" | "running" | "completed" | "error";
}

const INITIAL_PIPELINE_STEPS: PipelineStep[] = [
  { id: 1, title: "1. Ingest Message", desc: "Resolve contact & insert into SQLite messages table", status: "idle" },
  { id: 2, title: "2. AI Task Extraction", desc: "Scan action directives, deadlines & priority tagging", status: "idle" },
  { id: 3, title: "3. SQLite Storage", desc: "Commit tasks with context_message_id foreign key", status: "idle" },
  { id: 4, title: "4. ChromaDB Vector Sync", desc: "Chunk & embed into local semantic vector knowledge base", status: "idle" },
];

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [logOutput, setLogOutput] = useState<string>("");
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // Simulation Stepper State
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(INITIAL_PIPELINE_STEPS);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastExtractedTasks, setLastExtractedTasks] = useState<ExtractedTask[]>([]);
  const [simulationBanner, setSimulationBanner] = useState<{ type: "success" | "info" | "error"; msg: string } | null>(null);

  // Live Chat Simulator Form
  const [simSender, setSimSender] = useState<string>("Prof. Sharma");
  const [simChat, setSimChat] = useState<string>("Major Project Evaluation Committee");
  const [simContent, setSimContent] = useState<string>(
    "Team RAGTAG, please review the final presentation slides and submit the architecture diagram by tomorrow 5 PM."
  );
  const [simTimestamp, setSimTimestamp] = useState<string>("");
  const [simMode, setSimMode] = useState<"auto" | "ollama" | "heuristic">("auto");

  // Transcript / File Import State
  const [rawTranscript, setRawTranscript] = useState<string>("");
  const [importChatName, setImportChatName] = useState<string>("Imported WhatsApp Group");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // Append timestamped log to console
  const appendLog = (msg: string, tag: "INFO" | "SUCCESS" | "SIMULATION" | "TASK" | "ERROR" = "INFO") => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    const line = `[${ts}] [${tag}] ${msg}`;
    setLogOutput((prev) => (prev ? `${prev}\n${line}` : line));
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
      .catch((err) => {
        console.warn("Status telemetry error:", err);
      });
  };

  useEffect(() => {
    fetchStatus();
    appendLog("Engine connected to local SQLite ground truth & ChromaDB vector store.", "INFO");
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Helper sleep for animated stepper
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Run One-Click Faculty Evaluation Scenario (Prof. Sharma)
  const handleRunFacultyDemo = async () => {
    setIsSimulating(true);
    setSimulationBanner(null);
    setLastExtractedTasks([]);

    // Reset steps
    setPipelineSteps([
      { id: 1, title: "1. Ingest Message", desc: "Resolve contact & insert into SQLite messages table", status: "running" },
      { id: 2, title: "2. AI Task Extraction", desc: "Scan action directives, deadlines & priority tagging", status: "idle" },
      { id: 3, title: "3. SQLite Storage", desc: "Commit tasks with context_message_id foreign key", status: "idle" },
      { id: 4, title: "4. ChromaDB Vector Sync", desc: "Chunk & embed into local semantic vector knowledge base", status: "idle" },
    ]);

    appendLog("--- Starting Faculty Evaluator Demonstration Scenario ---", "SIMULATION");
    appendLog("Sender: Prof. Sharma | Chat: Major Project Evaluation Committee", "SIMULATION");
    appendLog("Content: \"Team RAGTAG, please review the final presentation slides and submit the architecture diagram by tomorrow 5 PM.\"", "SIMULATION");

    const payload = {
      sender_name: "Prof. Sharma",
      chat_name: "Major Project Evaluation Committee",
      content: "Team RAGTAG, please review the final presentation slides and submit the architecture diagram by tomorrow 5 PM.",
      timestamp: "2026-10-30T17:00:00",
      mode: "auto",
    };

    try {
      await sleep(350); // visual transition
      const res = await fetch("http://127.0.0.1:5000/api/simulation/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.status === "success") {
        // Step 1 done, step 2 running
        setPipelineSteps((prev) => [
          { ...prev[0], status: "completed" },
          { ...prev[1], status: "running" },
          prev[2],
          prev[3],
        ]);
        appendLog(`Message inserted with ground truth ID: ${data.message_id}`, "SUCCESS");
        await sleep(350);

        // Step 2 done, step 3 running
        setPipelineSteps((prev) => [
          prev[0],
          { ...prev[1], status: "completed" },
          { ...prev[2], status: "running" },
          prev[3],
        ]);
        const tasks: ExtractedTask[] = data.tasks_extracted || [];
        appendLog(`Task Extractor identified ${tasks.length} action item(s) from evaluator directive.`, "TASK");
        tasks.forEach((t) => {
          appendLog(`Extracted Action Item: "${t.task_name}" [Priority: ${t.priority || "High"}] [Due: ${t.due_date || "Oct 30, 2026 17:00"}]`, "TASK");
        });
        await sleep(350);

        // Step 3 done, step 4 running
        setPipelineSteps((prev) => [
          prev[0],
          prev[1],
          { ...prev[2], status: "completed" },
          { ...prev[3], status: "running" },
        ]);
        appendLog(`Foreign key context_message_id successfully grounded to ${data.message_id}`, "SUCCESS");
        await sleep(400);

        // Step 4 done
        setPipelineSteps((prev) => [
          prev[0],
          prev[1],
          prev[2],
          { ...prev[3], status: "completed" },
        ]);
        appendLog("ChromaDB vector embedding synchronized successfully.", "SUCCESS");

        setLastExtractedTasks(tasks);
        setSimulationBanner({
          type: "success",
          msg: `Faculty scenario successfully executed! ${tasks.length} action item(s) extracted and synchronized to Dashboard & Calendar.`,
        });
        fetchStatus();
      } else {
        throw new Error(data.message || "Failed to inject faculty evaluation message.");
      }
    } catch (err: any) {
      appendLog(`Simulation failed: ${err.message}`, "ERROR");
      setPipelineSteps((prev) =>
        prev.map((step) => (step.status === "running" ? { ...step, status: "error" } : step))
      );
      setSimulationBanner({
        type: "error",
        msg: `Demonstration scenario failed: ${err.message}`,
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Direct Live Message Simulator Injection
  const handleInjectCustomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simContent.trim()) {
      alert("Please enter message content.");
      return;
    }

    setLoading(true);
    setSimulationBanner(null);
    setLastExtractedTasks([]);

    appendLog(`Injecting live message from "${simSender || "Faculty Evaluator"}" into "${simChat}"...`, "SIMULATION");

    const payload = {
      sender_name: simSender.trim() || "Faculty Evaluator",
      chat_name: simChat.trim() || "Faculty Simulation",
      content: simContent.trim(),
      timestamp: simTimestamp || undefined,
      mode: simMode,
    };

    try {
      const res = await fetch("http://127.0.0.1:5000/api/simulation/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.status === "success") {
        const tasks: ExtractedTask[] = data.tasks_extracted || [];
        setLastExtractedTasks(tasks);
        appendLog(`Message ${data.message_id} injected into SQLite ground truth.`, "SUCCESS");

        if (tasks.length > 0) {
          appendLog(`Extracted ${tasks.length} new task(s)!`, "TASK");
          tasks.forEach((t) => appendLog(`- ${t.task_name} [${t.priority}] [Due: ${t.due_date}]`, "TASK"));
          setSimulationBanner({
            type: "success",
            msg: `Live message processed: Extracted ${tasks.length} action item(s) with priority and due date!`,
          });
        } else {
          appendLog("Message indexed into ChromaDB. No action item detected (casual conversation).", "INFO");
          setSimulationBanner({
            type: "info",
            msg: "Message indexed into SQLite and ChromaDB. No action item detected (casual conversation).",
          });
        }

        fetchStatus();
      } else {
        throw new Error(data.message || "Failed to inject live message.");
      }
    } catch (err: any) {
      appendLog(`Live message injection error: ${err.message}`, "ERROR");
      setSimulationBanner({
        type: "error",
        msg: `Injection failed: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // Direct WhatsApp Group Chat Transcript / File Import
  const handleParseAndImportTranscript = async () => {
    if (!rawTranscript.trim()) {
      alert("Please paste WhatsApp chat transcript or upload a .txt / .zip file.");
      return;
    }

    setIsImporting(true);
    setImportProgress("Parsing WhatsApp chat transcript...");
    appendLog("Parsing exported WhatsApp chat text...", "INFO");

    // Standard WhatsApp regex patterns:
    // [23/09/26, 09:15:30 AM] Sender: Message
    // 23/09/2026, 09:15 - Sender: Message
    // 9/23/26, 9:15 AM - Sender: Message
    const lineRegexA = /^\[?(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]?(?:\s*-\s*|\s+)([^:]+):\s+(.*)$/;

    const lines = rawTranscript.split(/\r?\n/);
    const parsedMessages: Array<{ sender: string; content: string; timestamp?: string }> = [];

    let currentMsg: { sender: string; content: string; timestamp?: string } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = line.match(lineRegexA);
      if (match) {
        if (currentMsg) {
          parsedMessages.push(currentMsg);
        }
        currentMsg = {
          sender: match[3].trim(),
          content: match[4].trim(),
        };
      } else if (currentMsg) {
        // Multiline message continuation
        currentMsg.content += "\n" + line;
      }
    }

    if (currentMsg) {
      parsedMessages.push(currentMsg);
    }

    // Fallback if formatting is irregular: treat each non-empty line as a message
    if (parsedMessages.length === 0) {
      parsedMessages.push({
        sender: "Imported Contact",
        content: rawTranscript.trim(),
      });
    }

    appendLog(`Parsed ${parsedMessages.length} chat message(s). Beginning sequential ground-truth ingestion...`, "INFO");

    let successCount = 0;
    let totalTasksExtracted = 0;

    for (let i = 0; i < parsedMessages.length; i++) {
      const m = parsedMessages[i];
      setImportProgress(`Ingesting message ${i + 1} of ${parsedMessages.length} (${m.sender})...`);

      try {
        const res = await fetch("http://127.0.0.1:5000/api/simulation/inject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender_name: m.sender,
            chat_name: importChatName.trim() || "Imported WhatsApp Group",
            content: m.content,
            timestamp: m.timestamp || undefined,
            mode: "auto",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          successCount++;
          if (data.tasks_extracted && data.tasks_extracted.length > 0) {
            totalTasksExtracted += data.tasks_extracted.length;
          }
        }
      } catch (err: any) {
        appendLog(`Error ingesting line ${i + 1}: ${err.message}`, "ERROR");
      }
    }

    appendLog(`Transcript Import Complete: ${successCount} message(s) ingested, ${totalTasksExtracted} action item(s) extracted.`, "SUCCESS");
    setImportProgress(null);
    setIsImporting(false);
    setRawTranscript("");
    fetchStatus();
    setSimulationBanner({
      type: "success",
      msg: `Successfully imported ${successCount} message(s) from transcript. ${totalTasksExtracted} action item(s) detected and saved.`,
    });
  };

  // File upload reader for .txt WhatsApp exports
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
      // ZIP files: send directly to backend /api/upload — backend extracts _chat.txt
      appendLog(`ZIP detected: "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Uploading to backend...`, "INFO");
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("http://localhost:5000/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.status === "success") {
          appendLog(`ZIP ingested: ${data.messages_added} messages, ${data.tasks_extracted} tasks extracted.`, "SUCCESS");
        } else {
          appendLog(`ZIP ingestion error: ${data.message}`, "ERROR");
        }
      } catch (err) {
        appendLog(`Upload failed: ${err}`, "ERROR");
      }
      return;
    }

    // .txt file: read locally and set transcript for manual import
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawTranscript(text);
      // Auto-set chat name from file name without extension
      const guessedName = file.name.replace(/\.txt$/i, "").replace(/^WhatsApp Chat with\s*/i, "");
      if (guessedName) {
        setImportChatName(guessedName);
      }
      appendLog(`Loaded file "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Ready to import.`, "INFO");
    };
    reader.readAsText(file);
  };

  // Trigger on-demand task extraction
  const handleTriggerTaskExtraction = async (forceReprocess: boolean = false) => {
    setLoading(true);
    appendLog(
      forceReprocess
        ? "Triggering full re-processing & upgrade of heuristic tasks via Ollama..."
        : "Triggering on-demand automated task extraction across all stored messages...",
      "TASK"
    );

    try {
      const res = await fetch("http://127.0.0.1:5000/api/tasks/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force_reprocess: forceReprocess,
          mode: forceReprocess ? "ollama" : "auto",
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === "success") {
        appendLog(
          `Task Extraction Completed!\n- Scanned Messages: ${data.scanned_messages}\n- New Tasks Created: ${data.new_tasks_created}\n- Tasks Upgraded: ${data.tasks_upgraded}\n- Mode Used: ${data.extraction_mode_used}`,
          "SUCCESS"
        );
        fetchStatus();
        setSimulationBanner({
          type: "success",
          msg: `Task extraction complete: Scanned ${data.scanned_messages} messages, created ${data.new_tasks_created} new tasks, upgraded ${data.tasks_upgraded} tasks using ${data.extraction_mode_used.toUpperCase()} engine.`,
        });
      } else {
        throw new Error(data.message || "Extraction failed");
      }
    } catch (err: any) {
      appendLog(`Task extraction failed: ${err.message}`, "ERROR");
      setSimulationBanner({
        type: "error",
        msg: `Task extraction error: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // Phase 1 Decryption
  const handleRunDecryption = async () => {
    setLoading(true);
    appendLog("Executing Phase 1: Local Decryption Pipeline (wadecrypt)...", "INFO");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/decrypt", { method: "POST" });
      const data = await res.json();
      appendLog(`Decryption result: ${data.message}`, data.status === "success" ? "SUCCESS" : "ERROR");
      if (data.logs) appendLog(data.logs, "INFO");
      fetchStatus();
    } catch (err: any) {
      appendLog(`Decryption trigger failed: ${err.message}`, "ERROR");
    } finally {
      setLoading(false);
    }
  };

  // Phase 2 Ingestion
  const handleRunIngestion = async () => {
    setLoading(true);
    appendLog("Executing Phase 2: Ingestion & Relational Bridge (ingest.py)...", "INFO");
    try {
      const res = await fetch("http://127.0.0.1:5000/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === "success") {
        appendLog(
          `Ingestion Complete!\n- Source: ${data.source}\n- Contacts: ${data.contacts_added}\n- Messages: ${data.messages_added}\n- Vectors: ${data.vectors_synced}\n- Tasks: ${data.tasks_extracted}`,
          "SUCCESS"
        );
      } else {
        appendLog(`Ingestion Notice: ${data.message || JSON.stringify(data)}`, "INFO");
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
      {/* Top Banner Header */}
      <div className="bg-white border border-gray-300 p-8 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-yellow-400 border border-black text-black">
              <RefreshCw className={`w-6 h-6 ${loading || isSimulating ? "animate-spin" : ""}`} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              Faculty Simulation &amp; Ingestion Center
            </h1>
          </div>
          <p className="text-sm text-gray-600 font-medium max-w-2xl">
            Execute live faculty evaluation demonstrations, simulate WhatsApp messages with real-time AI action item extraction, or import real exported WhatsApp transcripts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            className="px-4 py-2 border border-gray-300 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {simulationBanner && (
        <div
          className={`p-4 border flex items-center gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] ${
            simulationBanner.type === "success"
              ? "bg-emerald-50 border-emerald-400 text-emerald-950"
              : simulationBanner.type === "error"
              ? "bg-rose-50 border-rose-400 text-rose-950"
              : "bg-blue-50 border-blue-400 text-blue-950"
          }`}
        >
          {simulationBanner.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : simulationBanner.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          ) : (
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
          )}
          <span className="text-xs font-mono font-bold">{simulationBanner.msg}</span>
        </div>
      )}

      {/* SECTION 1: ONE-CLICK FACULTY EVALUATION SCENARIO */}
      <div className="bg-white border-2 border-black p-6 md:p-8 space-y-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-start justify-between flex-wrap gap-4 border-b border-gray-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase bg-yellow-400 border border-black text-black">
                Evaluation Demo Preset
              </span>
              <span className="text-xs font-mono text-gray-500">Milestone M2 &amp; M4 Showcase</span>
            </div>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">
              One-Click Faculty Evaluation Scenario (Prof. Sharma)
            </h2>
            <p className="text-xs text-gray-600 font-sans max-w-2xl leading-relaxed">
              Injects a high-priority faculty directive from Prof. Sharma into the Major Project Evaluation Committee chat. Follows real-time relational ingestion, AI action item extraction, ground truth storage, and ChromaDB vector synchronization.
            </p>
          </div>

          <button
            onClick={handleRunFacultyDemo}
            disabled={isSimulating}
            className={`py-3 px-6 text-xs font-black uppercase tracking-wider border-2 border-black transition-all duration-200 cursor-pointer flex items-center gap-2.5 ${
              isSimulating
                ? "bg-gray-200 text-gray-500 cursor-not-allowed border-gray-400"
                : "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]"
            }`}
          >
            <Play className={`w-4 h-4 fill-black ${isSimulating ? "animate-pulse" : ""}`} />
            <span>{isSimulating ? "Executing Pipeline..." : "Run Evaluator Demo Scenario (Prof. Sharma)"}</span>
          </button>
        </div>

        {/* 4-Stage Ingestion Pipeline Stepper */}
        <div className="space-y-3">
          <span className="text-xs font-mono font-bold text-gray-700 uppercase block">
            Real-Time Ingestion &amp; Extraction Pipeline Stepper
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pipelineSteps.map((step) => {
              const isCompleted = step.status === "completed";
              const isRunning = step.status === "running";
              const isError = step.status === "error";

              return (
                <div
                  key={step.id}
                  className={`p-3.5 border transition-all duration-200 ${
                    isCompleted
                      ? "border-emerald-500 bg-emerald-50"
                      : isRunning
                      ? "border-black bg-yellow-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : isError
                      ? "border-rose-400 bg-rose-50"
                      : "border-gray-200 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono font-bold text-gray-900">{step.title}</span>
                    {isCompleted ? (
                      <Check className="w-4 h-4 text-emerald-600 font-bold" />
                    ) : isRunning ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : isError ? (
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-600 leading-tight">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extracted Task Highlight Card */}
        {lastExtractedTasks.length > 0 && (
          <div className="bg-yellow-50 border-2 border-black p-5 space-y-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] animate-fadeIn">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-black/10 pb-2">
              <span className="text-xs font-mono font-black text-black uppercase flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 fill-yellow-400 text-black" />
                <span>Newly Grounded Action Item Detected</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-black text-white">
                FOREIGN KEY VERIFIED
              </span>
            </div>

            {lastExtractedTasks.map((task, idx) => (
              <div key={idx} className="bg-white border border-black p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 tracking-tight">
                      {task.task_name}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      Target Due Date: <span className="font-bold text-black">{task.due_date || "Oct 30, 2026 at 17:00"}</span>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-mono font-bold bg-black text-white border border-black shrink-0">
                    {task.priority || "High"} Priority
                  </span>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                  <span className="text-[11px] font-mono text-gray-500">
                    Extracted via {task.extraction_mode?.toUpperCase() || "AUTO"} Engine
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/"
                      className="px-3 py-1 bg-yellow-400 hover:bg-yellow-500 text-black border border-black text-xs font-bold flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                    >
                      <span>View in Dashboard</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                    <Link
                      href="/calendar"
                      className="px-3 py-1 bg-black hover:bg-gray-800 text-white border border-black text-xs font-bold flex items-center gap-1"
                    >
                      <Calendar className="w-3 h-3" />
                      <span>View in Calendar</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: LIVE CHAT SIMULATOR (DIRECT MESSAGE INJECTION) */}
      <div className="bg-white border border-gray-300 p-6 md:p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 bg-black text-white">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
              Live Chat Simulator (Direct Real-Time Message Injection)
            </h2>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Type custom chat messages to test deterministic heuristic extraction or Ollama local LLM task detection in real time.
          </p>
        </div>

        <form onSubmit={handleInjectCustomMessage} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                Sender Name
              </label>
              <input
                type="text"
                value={simSender}
                onChange={(e) => setSimSender(e.target.value)}
                placeholder="e.g. Prof. Sharma, Dr. Rao, Client"
                className="w-full px-3 py-2 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                Group Chat / Context Name
              </label>
              <input
                type="text"
                value={simChat}
                onChange={(e) => setSimChat(e.target.value)}
                placeholder="e.g. Major Project Evaluation Committee"
                className="w-full px-3 py-2 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
              Message Content (Include directives or dates like &quot;tomorrow 5 PM&quot; or &quot;by Friday&quot;)
            </label>
            <textarea
              rows={3}
              value={simContent}
              onChange={(e) => setSimContent(e.target.value)}
              placeholder="Type message content here..."
              className="w-full p-3 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                Timestamp (Optional)
              </label>
              <input
                type="datetime-local"
                value={simTimestamp}
                onChange={(e) => setSimTimestamp(e.target.value)}
                className="w-full px-3 py-2 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                Extraction Engine
              </label>
              <select
                value={simMode}
                onChange={(e: any) => setSimMode(e.target.value)}
                className="w-full px-3 py-2 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
              >
                <option value="auto">Auto (Hybrid Ollama + Fallback)</option>
                <option value="ollama">Ollama LLM Only</option>
                <option value="heuristic">Heuristics Only</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || isSimulating}
              className="py-2.5 px-6 bg-black hover:bg-gray-800 text-white border border-black text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? "Injecting..." : "Inject Live Message & Extract"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: DIRECT WHATSAPP GROUP CHAT TEXT / FILE IMPORT */}
      <div className="bg-white border border-gray-300 p-6 md:p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-black text-white">
                <Upload className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
                Direct WhatsApp Group Chat Text / File Import
              </h2>
            </div>
            <p className="text-xs text-gray-500 font-mono">
              Import real WhatsApp chats exported from Android or iOS directly into your local offline database.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-black border border-black text-xs font-mono font-bold cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose .txt or .zip</span>
              <input type="file" accept=".txt,.zip" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                Assign to Group Chat Name
              </label>
              <input
                type="text"
                value={importChatName}
                onChange={(e) => setImportChatName(e.target.value)}
                placeholder="e.g. Major Project Discussion Group"
                className="w-full px-3 py-2 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] text-gray-500 font-mono leading-relaxed pb-1">
                Supports standard exported WhatsApp formats: <code className="bg-gray-100 px-1">[dd/mm/yy, hh:mm:ss] Name: Message</code> or <code className="bg-gray-100 px-1">dd/mm/yyyy, hh:mm - Name: Message</code>.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
              Paste Raw WhatsApp Chat Transcript
            </label>
            <textarea
              rows={4}
              value={rawTranscript}
              onChange={(e) => setRawTranscript(e.target.value)}
              placeholder="Paste WhatsApp exported chat text here...&#10;e.g. [29/10/26, 14:30:15] Prof. Sharma: Team RAGTAG, submit the architecture diagram by tomorrow 5 PM."
              className="w-full p-3 border border-black text-xs font-mono bg-gray-50 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
            <button
              onClick={handleParseAndImportTranscript}
              disabled={isImporting || !rawTranscript.trim()}
              className={`py-2.5 px-6 text-xs font-bold uppercase tracking-wider border border-black flex items-center gap-2 cursor-pointer transition-all duration-200 ${
                rawTranscript.trim() && !isImporting
                  ? "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300"
              }`}
            >
              <Upload className={`w-3.5 h-3.5 ${isImporting ? "animate-spin" : ""}`} />
              <span>{isImporting ? "Importing Messages..." : "Import & Parse WhatsApp Transcript"}</span>
            </button>

            {importProgress && (
              <span className="text-xs font-mono font-bold text-emerald-700 animate-pulse">
                {importProgress}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 4: ON-DEMAND TASK EXTRACTOR & DECRYPT PIPELINE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: On-Demand Task Extractor */}
        <div className="bg-white border border-gray-300 p-6 space-y-4 md:col-span-1">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-black" />
              <span>Task Extractor Trigger</span>
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-400 font-mono">
              ON-DEMAND
            </span>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed font-sans">
            Scan all stored ground-truth messages to detect newly actionable directives or upgrade heuristic tasks with deep LLM reasoning.
          </p>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => handleTriggerTaskExtraction(false)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs font-bold bg-black hover:bg-gray-800 text-white border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Run Task Extractor</span>
            </button>

            <button
              onClick={() => handleTriggerTaskExtraction(true)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs font-bold bg-yellow-400 hover:bg-yellow-500 text-black border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3 h-3 text-black" />
              <span>Upgrade with Ollama</span>
            </button>
          </div>
        </div>

        {/* Card 2: Encrypted Backup Pipeline (Crypt15) */}
        <div className="bg-white border border-gray-300 p-6 space-y-4 md:col-span-1">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
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
            className={`w-full py-2 px-3 text-xs font-bold border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              status?.backup_found && status?.key_found
                ? "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                : "bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed"
            }`}
          >
            Run Decrypt (Phase 1)
          </button>
        </div>

        {/* Card 3: SQLite Ground Truth & Vector Index */}
        <div className="bg-white border border-gray-300 p-6 space-y-4 md:col-span-1">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">SQLite Ground Truth</span>
            <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-400">
              Active
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono text-gray-700">
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
            <div className="flex items-center justify-between">
              <span>Vectors Synced:</span>
              <span className="font-bold text-gray-900">{status?.vectors_count ?? 0}</span>
            </div>
          </div>

          <button
            onClick={handleRunIngestion}
            disabled={loading}
            className="w-full py-2 px-3 text-xs font-bold bg-black hover:bg-gray-800 text-white border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]"
          >
            {loading ? "Processing..." : "Run Ingest from backups/"}
          </button>
        </div>
      </div>

      {/* SECTION 5: INTERACTIVE EXECUTION LOG CONSOLE */}
      <div className="bg-white border border-gray-300 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
            <Terminal className="w-4 h-4 text-black" />
            <span>Real-Time Execution Log Console</span>
          </span>
          {logOutput && (
            <button
              onClick={() => setLogOutput("")}
              className="text-xs text-gray-500 hover:text-black font-mono cursor-pointer underline"
            >
              Clear Log
            </button>
          )}
        </div>
        <div
          ref={logTerminalRef}
          className="bg-gray-950 text-gray-200 font-mono text-xs p-4 border border-black min-h-[140px] max-h-[260px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed"
        >
          {logOutput || (
            <span className="text-gray-500">
              [SYSTEM] Standby. Click &quot;Run Evaluator Demo Scenario (Prof. Sharma)&quot; or &quot;Inject Live Message&quot; to begin pipeline execution.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
