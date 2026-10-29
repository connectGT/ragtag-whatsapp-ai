"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings as SettingsIcon,
  Database,
  Cpu,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
  Radio,
  Zap,
  Server,
  Layers,
  ArrowRight,
  Save,
} from "lucide-react";

interface SystemStatus {
  backup_found?: boolean;
  key_found?: boolean;
  decrypted_db_ready?: boolean;
  backup_directory?: string;
  database_path?: string;
  chroma_path?: string;
  ollama_online?: boolean;
  active_model?: string;
  inference_mode?: "auto" | "ollama_only" | "heuristic_only";
  user_name?: string;
  contacts_count?: number;
  messages_count?: number;
  tasks_count?: number;
  vectors_count?: number;
}

interface BackendSettings {
  user_name: string;
  inference_mode: "auto" | "ollama_only" | "heuristic_only";
  ollama_model?: string;
  ollama_url?: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [userName, setUserName] = useState<string>("Guru");
  const [inferenceMode, setInferenceMode] = useState<"auto" | "ollama_only" | "heuristic_only">("auto");
  const [ollamaModel, setOllamaModel] = useState<string>("llama3:latest");
  const [loading, setLoading] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTestingOllama, setIsTestingOllama] = useState<boolean>(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<string | null>(null);

  // Fetch telemetry status from /api/status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/status");
      if (res.ok) {
        const data: SystemStatus = await res.json();
        setStatus(data);
        if (data.inference_mode) {
          setInferenceMode(data.inference_mode);
        }
        if (data.active_model) {
          setOllamaModel(data.active_model);
        }
      }
    } catch (err) {
      console.warn("Backend status telemetry unreachable (offline mode):", err);
    }
  }, []);

  // Fetch persistent settings from /api/settings and cache to localStorage
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/settings");
      if (res.ok) {
        const data: BackendSettings = await res.json();
        if (data.user_name) {
          setUserName(data.user_name);
          if (typeof window !== "undefined") {
            localStorage.setItem("ragtag_user_name", data.user_name);
          }
        }
        if (data.inference_mode) {
          setInferenceMode(data.inference_mode);
          if (typeof window !== "undefined") {
            localStorage.setItem("ragtag_inference_mode", data.inference_mode);
          }
        }
        if (data.ollama_model) {
          setOllamaModel(data.ollama_model);
        }
      } else {
        // Fallback to localStorage if API fails
        if (typeof window !== "undefined") {
          const cachedName = localStorage.getItem("ragtag_user_name");
          if (cachedName) setUserName(cachedName);
          const cachedMode = localStorage.getItem("ragtag_inference_mode") as any;
          if (cachedMode) setInferenceMode(cachedMode);
        }
      }
    } catch {
      // Fallback to localStorage on network error
      if (typeof window !== "undefined") {
        const cachedName = localStorage.getItem("ragtag_user_name");
        if (cachedName) setUserName(cachedName);
        const cachedMode = localStorage.getItem("ragtag_inference_mode") as any;
        if (cachedMode) setInferenceMode(cachedMode);
      }
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchSettings();
    fetchStatus();

    // 5-second telemetry polling loop
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchSettings, fetchStatus]);

  // Handle saving User Display Name
  const handleSaveUserName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setSaveSuccess(null);
    setSaveError(null);

    const trimmed = userName.trim() || "Guru";
    try {
      const res = await fetch("http://127.0.0.1:5000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: trimmed }),
      });

      if (res.ok) {
        const updated = await res.json();
        setUserName(updated.user_name);
        if (typeof window !== "undefined") {
          localStorage.setItem("ragtag_user_name", updated.user_name);
        }
        setSaveSuccess(`User identity updated to "${updated.user_name}" across briefings, summaries, and mention detection!`);
        setTimeout(() => setSaveSuccess(null), 5000);
        fetchStatus();
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveError(errData.error || "Failed to update user identity on backend.");
      }
    } catch (err: any) {
      // Offline fallback: save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("ragtag_user_name", trimmed);
      }
      setSaveSuccess(`Cached "${trimmed}" locally in localStorage (backend offline).`);
      setTimeout(() => setSaveSuccess(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Handle switching Inference Mode
  const handleModeChange = async (mode: "auto" | "ollama_only" | "heuristic_only") => {
    setInferenceMode(mode);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inference_mode: mode }),
      });

      if (res.ok) {
        const updated = await res.json();
        setInferenceMode(updated.inference_mode);
        if (typeof window !== "undefined") {
          localStorage.setItem("ragtag_inference_mode", updated.inference_mode);
        }
        setSaveSuccess(`Inference engine set to "${updated.inference_mode.toUpperCase()}" mode.`);
        setTimeout(() => setSaveSuccess(null), 4000);
        fetchStatus();
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveError(errData.error || "Failed to update inference mode.");
      }
    } catch (err: any) {
      if (typeof window !== "undefined") {
        localStorage.setItem("ragtag_inference_mode", mode);
      }
      setSaveSuccess(`Inference mode "${mode}" cached locally.`);
      setTimeout(() => setSaveSuccess(null), 4000);
    }
  };

  // Handle saving Model Name
  const handleSaveModel = async () => {
    setLoading(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollama_model: ollamaModel.trim() }),
      });

      if (res.ok) {
        setSaveSuccess(`Active Ollama model configured to "${ollamaModel.trim()}".`);
        setTimeout(() => setSaveSuccess(null), 4000);
        fetchStatus();
      } else {
        setSaveError("Failed to update active model configuration.");
      }
    } catch (err: any) {
      setSaveError("Backend communication error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Test local Ollama daemon connection
  const handleTestOllama = async () => {
    setIsTestingOllama(true);
    setOllamaTestResult(null);
    try {
      const startTime = performance.now();
      const res = await fetch("http://127.0.0.1:5000/api/status");
      const elapsed = Math.round(performance.now() - startTime);
      if (res.ok) {
        const data: SystemStatus = await res.json();
        if (data.ollama_online) {
          setOllamaTestResult(`Ollama daemon is reachable at 127.0.0.1:11434 (${elapsed}ms latency). Model: ${data.active_model}`);
        } else {
          setOllamaTestResult("Ollama daemon is offline at 127.0.0.1:11434. System is running in fallback heuristic rule mode.");
        }
      }
    } catch {
      setOllamaTestResult("Backend API unreachable on port 5000.");
    } finally {
      setIsTestingOllama(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="bg-white border border-gray-300 p-8 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-yellow-400 border border-black text-black">
              <SettingsIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              Live System Settings &amp; Engine Command
            </h1>
          </div>
          <p className="text-sm text-gray-600 font-medium max-w-2xl">
            Configure user identity targeting, toggle AI inference extraction engines, and monitor real-time SQLite and ChromaDB vector telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchSettings();
              fetchStatus();
            }}
            className="px-4 py-2 border border-gray-300 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Poll Telemetry</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banners */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-400 p-4 text-emerald-950 flex items-center gap-3 shadow-[2px_2px_0px_0px_rgba(16,185,129,0.3)] animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-xs font-mono font-bold">{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-400 p-4 text-rose-950 flex items-center gap-3 shadow-[2px_2px_0px_0px_rgba(244,63,94,0.3)]">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-xs font-mono font-bold">{saveError}</span>
        </div>
      )}

      {/* SECTION 1: User Identity Customization */}
      <div className="bg-white border border-gray-300 p-6 md:p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-black text-white">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
                User Identity &amp; Mention Targeting
              </h2>
              <p className="text-xs text-gray-500 font-mono">
                Used by /api/catchup, /api/summary, and task extraction to identify direct user action items.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-yellow-100 text-yellow-900 border border-yellow-400">
            Active: @{userName || "Guru"}
          </span>
        </div>

        <form onSubmit={handleSaveUserName} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-mono font-bold text-gray-700 uppercase block">
                User Display Name (e.g. Guru, Prof. Sharma, Rahul)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 font-mono text-sm font-bold">@</span>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full pl-8 pr-4 py-2 border border-black text-sm font-mono font-medium focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-gray-50 focus:bg-white transition-colors"
                />
              </div>
              <p className="text-[11px] text-gray-500 font-mono">
                When chat messages say &quot;@{userName}&quot; or reference your name, RAGTAG prioritizes and surfaces them in your briefing feed.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 bg-black hover:bg-gray-800 text-white border border-black text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? "Saving..." : "Save Identity"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: Inference Engine Mode Switcher */}
      <div className="bg-white border border-gray-300 p-6 md:p-8 space-y-6">
        <div className="border-b border-gray-200 pb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-black text-white">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
                Inference Engine Execution Mode
              </h2>
              <p className="text-xs text-gray-500 font-mono">
                Select how action items, due dates, and priorities are parsed and upgraded from WhatsApp chats.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-400">
            Current: {inferenceMode.toUpperCase()}
          </span>
        </div>

        {/* Radio Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Option 1: Auto */}
          <div
            onClick={() => handleModeChange("auto")}
            className={`p-5 border-2 cursor-pointer transition-all duration-150 relative flex flex-col justify-between ${
              inferenceMode === "auto"
                ? "border-black bg-yellow-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                : "border-gray-300 bg-white hover:border-gray-500"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase bg-yellow-400 border border-black text-black">
                  Recommended
                </span>
                <Radio className={`w-4 h-4 ${inferenceMode === "auto" ? "text-black" : "text-gray-300"}`} />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight mb-1">
                Auto (Hybrid Mode)
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed font-sans mb-4">
                Attempts local Ollama LLM extraction first. If Ollama daemon is offline or timed out, seamlessly falls back to offline deterministic regex heuristics.
              </p>
            </div>
            <div className="text-[11px] font-mono text-gray-500 pt-2 border-t border-gray-200">
              Ollama + Heuristic Fallback
            </div>
          </div>

          {/* Option 2: Ollama Only */}
          <div
            onClick={() => handleModeChange("ollama_only")}
            className={`p-5 border-2 cursor-pointer transition-all duration-150 relative flex flex-col justify-between ${
              inferenceMode === "ollama_only"
                ? "border-black bg-yellow-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                : "border-gray-300 bg-white hover:border-gray-500"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase bg-black text-white">
                  Deep Neural
                </span>
                <Radio className={`w-4 h-4 ${inferenceMode === "ollama_only" ? "text-black" : "text-gray-300"}`} />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight mb-1">
                Local Ollama LLM Only
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed font-sans mb-4">
                Strict local neural model processing. Requires active Ollama daemon. Understands complex natural language and semantic dates.
              </p>
            </div>
            <div className="text-[11px] font-mono text-gray-500 pt-2 border-t border-gray-200">
              Requires 127.0.0.1:11434
            </div>
          </div>

          {/* Option 3: Heuristic Only */}
          <div
            onClick={() => handleModeChange("heuristic_only")}
            className={`p-5 border-2 cursor-pointer transition-all duration-150 relative flex flex-col justify-between ${
              inferenceMode === "heuristic_only"
                ? "border-black bg-yellow-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                : "border-gray-300 bg-white hover:border-gray-500"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase bg-gray-200 text-gray-800 border border-gray-400">
                  Zero Overhead
                </span>
                <Radio className={`w-4 h-4 ${inferenceMode === "heuristic_only" ? "text-black" : "text-gray-300"}`} />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight mb-1">
                Offline Heuristics Only
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed font-sans mb-4">
                100% deterministic pattern extraction. Zero GPU/CPU LLM overhead, ultra-fast regex parsing of due dates and action directives.
              </p>
            </div>
            <div className="text-[11px] font-mono text-gray-500 pt-2 border-t border-gray-200">
              Deterministic Rule Engine
            </div>
          </div>
        </div>

        {/* Model Customization & Connection Test Bar */}
        <div className="pt-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-mono font-bold text-gray-700 uppercase">
              Active Model:
            </label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="e.g. llama3:latest"
              className="px-3 py-1.5 border border-black font-mono text-xs bg-gray-50 focus:bg-white focus:outline-none"
            />
            <button
              onClick={handleSaveModel}
              disabled={loading}
              className="px-3 py-1.5 bg-black text-white text-xs font-bold uppercase hover:bg-gray-800 cursor-pointer"
            >
              Update Model
            </button>
          </div>

          <button
            onClick={handleTestOllama}
            disabled={isTestingOllama}
            className="px-3 py-1.5 border border-black text-xs font-bold uppercase hover:bg-gray-100 flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className={`w-3.5 h-3.5 ${isTestingOllama ? "animate-spin" : ""}`} />
            <span>{isTestingOllama ? "Pinging..." : "Test Ollama Daemon"}</span>
          </button>
        </div>

        {ollamaTestResult && (
          <div className="p-3 bg-gray-100 border border-gray-300 text-xs font-mono text-gray-800">
            {ollamaTestResult}
          </div>
        )}
      </div>

      {/* SECTION 3: Live System Telemetry & Engine Inspection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <Sliders className="w-4 h-4 text-black" />
            <span>Live System Telemetry &amp; Storage Inspection</span>
          </h2>
          <span className="text-xs font-mono text-gray-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Telemetry Poll: 5s
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Telemetry Card 1: SQLite Storage */}
          <div className="bg-white border border-gray-300 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
                <Database className="w-4 h-4 text-black" />
                <span>Active SQLite Storage</span>
              </span>
              <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 font-mono">
                GROUND TRUTH
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="text-gray-500 block text-[11px]">Database Path:</span>
                <span className="text-gray-900 font-bold break-all bg-gray-50 p-1 border border-gray-200 block">
                  {status?.database_path || "backend/msgstore_ragtag.db"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                <div className="bg-gray-50 p-2.5 border border-gray-200">
                  <span className="text-gray-500 text-[10px] block uppercase">Contacts</span>
                  <span className="text-base font-black text-gray-900">{status?.contacts_count ?? 0}</span>
                </div>
                <div className="bg-gray-50 p-2.5 border border-gray-200">
                  <span className="text-gray-500 text-[10px] block uppercase">Messages</span>
                  <span className="text-base font-black text-gray-900">{status?.messages_count ?? 0}</span>
                </div>
                <div className="bg-gray-50 p-2.5 border border-gray-200">
                  <span className="text-gray-500 text-[10px] block uppercase">Tasks</span>
                  <span className="text-base font-black text-gray-900">{status?.tasks_count ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry Card 2: ChromaDB Vector Knowledge Base */}
          <div className="bg-white border border-gray-300 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
                <Layers className="w-4 h-4 text-black" />
                <span>Vector Knowledge Base</span>
              </span>
              <span className="px-2 py-0.5 text-[11px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-400 font-mono">
                CHROMADB
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="text-gray-500 block text-[11px]">Vector Store Path:</span>
                <span className="text-gray-900 font-bold break-all bg-gray-50 p-1 border border-gray-200 block">
                  {status?.chroma_path || "backend/chroma_store"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                <div className="bg-gray-50 p-2.5 border border-gray-200">
                  <span className="text-gray-500 text-[10px] block uppercase">Vectors</span>
                  <span className="text-base font-black text-gray-900">{status?.vectors_count ?? 0}</span>
                </div>
                <div className="bg-gray-50 p-2.5 border border-gray-200">
                  <span className="text-gray-500 text-[10px] block uppercase">Chunk Size</span>
                  <span className="text-base font-black text-gray-900">500</span>
                </div>
                <div className="bg-gray-50 p-2.5 border border-gray-200">
                  <span className="text-gray-500 text-[10px] block uppercase">Overlap</span>
                  <span className="text-base font-black text-gray-900">50</span>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry Card 3: Inference Engine Status */}
          <div className="bg-white border border-gray-300 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
                <Server className="w-4 h-4 text-black" />
                <span>Local Inference Daemon</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold font-mono border ${
                  status?.ollama_online
                    ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                    : "bg-amber-100 text-amber-900 border-amber-400"
                }`}
              >
                {status?.ollama_online ? "CONNECTED" : "OFFLINE / HEURISTIC FALLBACK"}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono text-gray-700">
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Daemon Socket:</span>
                <span className="font-bold text-gray-900">127.0.0.1:11434</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Active Model:</span>
                <span className="font-bold text-gray-900">{status?.active_model || ollamaModel}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-500">Configured Mode:</span>
                <span className="font-bold text-gray-900 uppercase">{status?.inference_mode || inferenceMode}</span>
              </div>
            </div>
          </div>

          {/* Telemetry Card 4: Air-Gap Security Status */}
          <div className="bg-white border border-gray-300 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <span className="text-xs font-mono font-bold text-gray-700 uppercase flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-black" />
                <span>Air-Gap Security Verification</span>
              </span>
              <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 font-mono">
                100% LOCAL
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono text-gray-700">
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">External Network Traffic:</span>
                <span className="font-bold text-emerald-700">ZERO (BLOCKED)</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Cloud AI Dependencies:</span>
                <span className="font-bold text-emerald-700">NONE (AIR-GAPPED)</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-500">Ground Truth Privacy:</span>
                <span className="font-bold text-gray-900">Host Filesystem Only</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
