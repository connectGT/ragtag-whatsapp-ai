"use client";

import React, { useState, useEffect, useCallback } from "react";
import { TaskCard, TaskCardProps, ContextMessage } from "./TaskCard";
import { ContextModal } from "./ContextModal";
import {
  ListCheck,
  Clock,
  CheckCircle2,
  Search,
  Sparkles,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
  X,
  Zap,
} from "lucide-react";

export const DashboardView: React.FC = () => {
  const [tasks, setTasks] = useState<TaskCardProps[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState<boolean>(true);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractBanner, setExtractBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/tasks");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTasks(data);
        }
      } else {
        console.error("Failed to fetch tasks with HTTP status:", res.status);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const [activeTab, setActiveTab] = useState<"Assigned to Me" | "All" | "Pending" | "Approved" | "Dismissed">("Assigned to Me");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContextMsg, setSelectedContextMsg] = useState<ContextMessage | null>(null);

  const handleExtractTasks = async () => {
    setIsExtracting(true);
    setExtractBanner(null);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/tasks/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (res.ok && (data.status === "success" || data.new_tasks_created !== undefined)) {
        const newCount = data.new_tasks_created ?? 0;
        const upgCount = data.tasks_upgraded ?? 0;
        const modeUsed = (data.extraction_mode_used || "heuristic").toUpperCase();
        const scanned = data.scanned_messages ?? 0;

        let summary = `Extraction complete: ${newCount} new action item${
          newCount === 1 ? "" : "s"
        } found!`;
        if (upgCount > 0) {
          summary += ` (${upgCount} upgraded via ${modeUsed})`;
        } else {
          summary += ` (Engine: ${modeUsed}, scanned ${scanned} messages)`;
        }

        setExtractBanner({
          type: "success",
          message: summary,
        });

        await fetchTasks();
      } else {
        setExtractBanner({
          type: "error",
          message: data.message || "Extraction failed. Verify backend services are active.",
        });
      }
    } catch (err) {
      setExtractBanner({
        type: "error",
        message: "Network error triggering task extraction. Ensure backend is running at http://127.0.0.1:5000.",
      });
    } finally {
      setIsExtracting(false);
    }
  };


  const handleApprove = (id: string) => {
    fetch("http://127.0.0.1:5000/api/tasks/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Approved" }),
    }).catch((err) => console.error("Failed to update task status:", err));

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "Approved" } : t))
    );
  };

  const handleDismiss = (id: string) => {
    fetch("http://127.0.0.1:5000/api/tasks/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Dismissed" }),
    }).catch((err) => console.error("Failed to update task status:", err));

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "Dismissed" } : t))
    );
  };

  const isTaskForMe = (t: TaskCardProps) => {
    const a = (t.assigned_to || "").toLowerCase();
    return a.includes("guru") || a.includes("me") || a.includes("all") || a.includes("team") || !t.assigned_to;
  };

  const filteredTasks = tasks.filter((t) => {
    let matchesTab = true;
    if (activeTab === "Assigned to Me") {
      matchesTab = isTaskForMe(t);
    } else if (activeTab !== "All") {
      matchesTab = (t.status || "").toLowerCase() === activeTab.toLowerCase();
    }

    const chatName = t.context_message?.chat_name || "";
    const senderName = t.context_message?.sender_name || "";
    const assigned = t.assigned_to || "";
    const matchesSearch =
      t.task_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chatName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assigned.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const pendingCount = tasks.filter(
    (t) => (t.status || "").toLowerCase() === "pending"
  ).length;
  const approvedCount = tasks.filter(
    (t) => (t.status || "").toLowerCase() === "approved"
  ).length;

  return (
    <div className="space-y-8">
      {/* Metric Stat Cards & Quick Action Trigger */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border-2 border-black p-6 flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase block mb-1">
              Total Extracted
            </span>
            <span className="text-3xl font-black text-gray-900">{tasks.length}</span>
          </div>
          <div className="p-3.5 bg-gray-100 border border-black text-black">
            <ListCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border-2 border-black p-6 flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase block mb-1">
              Pending Review
            </span>
            <span className="text-3xl font-black text-gray-900">{pendingCount}</span>
          </div>
          <div className="p-3.5 bg-yellow-400 border border-black text-black">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border-2 border-black p-6 flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase block mb-1">
              Approved (.ics)
            </span>
            <span className="text-3xl font-black text-gray-900">{approvedCount}</span>
          </div>
          <div className="p-3.5 bg-emerald-400 border border-black text-black">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Extraction Notification Banner */}
      {extractBanner && (
        <div
          className={`p-4 border-2 border-black flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all ${
            extractBanner.type === "success"
              ? "bg-emerald-50 text-emerald-950"
              : extractBanner.type === "error"
              ? "bg-red-50 text-red-950"
              : "bg-yellow-50 text-yellow-950"
          }`}
        >
          <div className="flex items-center gap-3">
            {extractBanner.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : extractBanner.type === "error" ? (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            ) : (
              <Zap className="w-5 h-5 text-yellow-600 shrink-0" />
            )}
            <p className="text-xs font-bold font-mono tracking-tight">
              {extractBanner.message}
            </p>
          </div>
          <button
            onClick={() => setExtractBanner(null)}
            className="p-1 hover:bg-black/10 transition-colors cursor-pointer text-black"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Controls & Toolbar */}
      <div className="bg-white p-6 border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-4">
        {/* Action Header Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4 text-black" />
              <span>Task Action Center</span>
            </h2>
            <p className="text-xs text-gray-500 font-mono">
              Scan WhatsApp messages for upcoming deliverables or sync to calendar
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* AI Task Extraction Button */}
            <button
              onClick={handleExtractTasks}
              disabled={isExtracting}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border-2 border-black transition-all cursor-pointer ${
                isExtracting
                  ? "bg-yellow-200 text-gray-700 cursor-not-allowed opacity-90 shadow-none"
                  : "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              }`}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Extracting tasks with AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  <span>Scan Action Items</span>
                </>
              )}
            </button>

            

            {/* Refresh Tasks Button */}
            <button
              onClick={fetchTasks}
              disabled={isLoadingTasks}
              title="Refresh Tasks"
              className="p-2 bg-gray-50 hover:bg-gray-200 text-black border border-black transition-all cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingTasks ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {(["Assigned to Me", "All", "Pending", "Approved", "Dismissed"] as const).map((tab) => {
              const count =
                tab === "All"
                  ? tasks.length
                  : tab === "Assigned to Me"
                  ? tasks.filter(isTaskForMe).length
                  : tasks.filter(
                      (t) => (t.status || "").toLowerCase() === tab.toLowerCase()
                    ).length;
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? "bg-black text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                  }`}
                >
                  <span>{tab}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-xs font-mono ${
                      isActive
                        ? "bg-yellow-400 text-black font-black"
                        : "bg-gray-300 text-gray-800"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tasks, groups, senders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 bg-gray-50 border-2 border-black text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-yellow-50/50 transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* Task Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredTasks.map((t) => (
          <TaskCard
            key={t.id}
            {...t}
            onApprove={handleApprove}
            onDismiss={handleDismiss}
            onViewContext={(msg) => setSelectedContextMsg(msg)}
          />
        ))}
      </div>

      {filteredTasks.length === 0 && (
        <div className="bg-white p-16 text-center border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="w-12 h-12 bg-yellow-100 border-2 border-black mx-auto flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-black" />
          </div>
          <h3 className="text-base font-black uppercase tracking-wider text-gray-900">
            No matching action items found
          </h3>
          <p className="text-xs text-gray-500 font-mono max-w-md mx-auto leading-relaxed">
            {tasks.length === 0
              ? "No tasks extracted yet. Click 'Scan Action Items' above to parse your WhatsApp chats with local AI."
              : "Try adjusting your search query or switching status filter tabs."}
          </p>
          {tasks.length === 0 && (
            <button
              onClick={handleExtractTasks}
              disabled={isExtracting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Trigger Initial Extraction</span>
            </button>
          )}
        </div>
      )}

      {/* Ground Truth Context Trace Modal */}
      <ContextModal
        message={selectedContextMsg}
        onClose={() => setSelectedContextMsg(null)}
      />
    </div>
  );
};

