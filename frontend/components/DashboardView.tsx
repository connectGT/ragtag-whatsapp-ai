"use client";

import React, { useState } from "react";
import { TaskCard, TaskCardProps, ContextMessage } from "./TaskCard";
import { ContextModal } from "./ContextModal";
import { ListCheck, Clock, CheckCircle2, Search } from "lucide-react";

export const DashboardView: React.FC = () => {
  const [tasks, setTasks] = useState<TaskCardProps[]>([
    {
      id: "task-1",
      task_name: "Finish Next.js UI mockups",
      due_date: "Sep 24, 2026 at 23:59",
      priority: "High",
      status: "Pending",
      context_message: {
        id: "msg_cb0ad8d1",
        sender_name: "Guru Tiwari",
        sender_id: "contact_guru",
        chat_name: "RAGTAG Project Group",
        content: "Eshanya, please finish the Next.js UI mockups by tomorrow night.",
        timestamp: "Sep 23, 2026 09:15",
      },
    },
    {
      id: "task-2",
      task_name: "Submit SDMS portal files",
      due_date: "Sep 26, 2026 at 17:00",
      priority: "High",
      status: "Pending",
      context_message: {
        id: "msg_78f102a9",
        sender_name: "Prof. H. Sharma",
        sender_id: "contact_prof_sharma",
        chat_name: "CS-401 Project Chat",
        content:
          "Reminder to all teams: Submit the SDMS portal files by Friday end of day without fail.",
        timestamp: "Sep 22, 2026 14:30",
      },
    },
    {
      id: "task-3",
      task_name: "Review ChromaDB vector chunking parameters",
      due_date: "Sep 23, 2026 at 21:00",
      priority: "Medium",
      status: "Pending",
      context_message: {
        id: "msg_a32b918f",
        sender_name: "Eshanya Bhaiji",
        sender_id: "contact_eshanya",
        chat_name: "RAGTAG Core Devs",
        content:
          "Can someone review the LangChain text chunk size for ChromaDB indexing tonight?",
        timestamp: "Sep 23, 2026 08:45",
      },
    },
  ]);

  const [activeTab, setActiveTab] = useState<"All" | "Pending" | "Approved" | "Dismissed">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContextMsg, setSelectedContextMsg] = useState<ContextMessage | null>(null);

  const handleApprove = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "Approved" } : t))
    );
  };

  const handleDismiss = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "Dismissed" } : t))
    );
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesTab = activeTab === "All" || t.status === activeTab;
    const matchesSearch =
      t.task_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.context_message.chat_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.context_message.sender_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const pendingCount = tasks.filter((t) => t.status === "Pending").length;
  const approvedCount = tasks.filter((t) => t.status === "Approved").length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-300 p-6 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase block mb-1">Total Extracted</span>
            <span className="text-3xl font-black text-gray-900">{tasks.length}</span>
          </div>
          <div className="p-3.5 bg-gray-100 border border-gray-300 text-black">
            <ListCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase block mb-1">Pending Review</span>
            <span className="text-3xl font-black text-gray-900">{pendingCount}</span>
          </div>
          <div className="p-3.5 bg-yellow-400 border border-black text-black">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase block mb-1">Approved (.ics)</span>
            <span className="text-3xl font-black text-gray-900">{approvedCount}</span>
          </div>
          <div className="p-3.5 bg-emerald-400 border border-black text-black">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-white p-6 border border-gray-300 shadow-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {(["All", "Pending", "Approved", "Dismissed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeTab === tab
                  ? "bg-black text-white border border-black"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tasks, groups, senders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-gray-50 border border-gray-300 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-black transition-all duration-200"
          />
        </div>
      </div>

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
        <div className="bg-white p-16 text-center border border-gray-300 space-y-3">
          <h3 className="text-base font-bold uppercase tracking-wider text-gray-800">
            No matching tasks found
          </h3>
          <p className="text-xs text-gray-500 font-mono">
            Try adjusting your search query or tab filters.
          </p>
        </div>
      )}

      <ContextModal
        message={selectedContextMsg}
        onClose={() => setSelectedContextMsg(null)}
      />
    </div>
  );
};
