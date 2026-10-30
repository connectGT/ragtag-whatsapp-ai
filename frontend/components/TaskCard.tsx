"use client";

import React, { useState } from "react";
import { Clock, User, CalendarPlus, CheckCircle2, XCircle, MessageSquareCode } from "lucide-react";

export interface ContextMessage {
  id: string;
  sender_name: string;
  sender_id: string;
  chat_name: string;
  content: string;
  timestamp: string;
}

export interface TaskCardProps {
  id: string;
  task_name: string;
  due_date: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Approved" | "Dismissed";
  context_message: ContextMessage;
  onApprove?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onViewContext?: (message: ContextMessage) => void;
}

/**
 * Build a Google Calendar "Add Event" URL — no OAuth, no API key needed.
 * Opens calendar.google.com in a new tab with the event pre-filled.
 * Format: https://calendar.google.com/calendar/render?action=TEMPLATE&...
 */
function buildGoogleCalendarUrl(
  taskName: string,
  dueDateStr: string,
  description: string
): string {
  // Parse the due date — backend returns strings like "Sep 24, 2026 at 09:19"
  let startDate: Date;
  try {
    startDate = new Date(dueDateStr.replace(" at ", " "));
    if (isNaN(startDate.getTime())) throw new Error("invalid");
  } catch {
    // Default to tomorrow 9 AM if date can't be parsed
    startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(9, 0, 0, 0);
  }

  // End = start + 1 hour
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  // Google Calendar expects: YYYYMMDDTHHmmssZ
  const fmt = (d: Date) =>
    d.toISOString().replace(/-|:|\.\d{3}/g, "").slice(0, 15) + "Z";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: taskName,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: description,
    // No location needed
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  id,
  task_name,
  due_date,
  priority,
  status,
  context_message,
  onApprove,
  onDismiss,
  onViewContext,
}) => {
  const [currentStatus, setCurrentStatus] = useState<"Pending" | "Approved" | "Dismissed">(
    status
  );

  const priorityStyles = {
    High: "bg-black text-white border border-black",
    Medium: "bg-gray-200 text-gray-900 border border-gray-400",
    Low: "bg-gray-100 text-gray-700 border border-gray-300",
  };

  const statusStyles = {
    Pending: "bg-yellow-100 text-yellow-900 border border-yellow-400",
    Approved: "bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold",
    Dismissed: "bg-gray-100 text-gray-500 border border-gray-300 line-through opacity-60",
  };

  const handleApproveAndRemind = () => {
    // 1. Mark as approved in the backend
    setCurrentStatus("Approved");
    if (onApprove) onApprove(id);

    // 2. Open Google Calendar with the task pre-filled — user clicks Save once
    const description = `From ${context_message.sender_name} in "${context_message.chat_name}":\n\n"${context_message.content}"\n\n— Extracted by RAGTAG Local AI`;
    const url = buildGoogleCalendarUrl(task_name, due_date, description);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDismiss = () => {
    setCurrentStatus("Dismissed");
    if (onDismiss) onDismiss(id);
  };

  return (
    <div
      className={`card-lift bg-white border border-gray-300 p-7 flex flex-col justify-between transition-all duration-200 ${
        currentStatus === "Dismissed" ? "opacity-50 grayscale" : ""
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${priorityStyles[priority]}`}
            >
              {priority} Priority
            </span>
            <span
              className={`px-3 py-1 text-xs font-semibold ${statusStyles[currentStatus]}`}
            >
              {currentStatus}
            </span>
          </div>
          <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2.5 py-1 border border-gray-300">
            {context_message.chat_name}
          </span>
        </div>

        <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-3 leading-snug">
          {task_name}
        </h3>

        <p className="text-xs text-gray-700 bg-gray-50 p-4 border-l-3 border-l-yellow-400 border-y border-r border-gray-200 mb-6 italic font-serif leading-relaxed">
          &ldquo;{context_message.content}&rdquo;
        </p>

        <div className="flex items-center justify-between text-xs text-gray-600 mb-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <Clock className="w-4 h-4 text-black" />
            <span>Due: {due_date}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500 font-mono">
            <User className="w-3.5 h-3.5" />
            <span>{context_message.sender_name}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
        <button
          onClick={() => onViewContext && onViewContext(context_message)}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-gray-900 bg-white hover:bg-gray-100 border border-gray-300 hover:border-gray-400 transition-all duration-200 cursor-pointer"
        >
          <MessageSquareCode className="w-4 h-4 text-black" />
          <span>View Context</span>
        </button>

        <div className="flex items-center gap-2">
          {currentStatus !== "Dismissed" && (
            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-700 hover:text-black bg-white hover:bg-gray-100 border border-gray-300 hover:border-gray-400 transition-all duration-200 cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              <span>Dismiss</span>
            </button>
          )}

          <button
            onClick={handleApproveAndRemind}
            disabled={currentStatus === "Approved"}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border border-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              currentStatus === "Approved"
                ? "bg-emerald-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-default"
                : "bg-yellow-400 hover:bg-yellow-500 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            }`}
          >
            {currentStatus === "Approved" ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Added to Google</span>
              </>
            ) : (
              <>
                <CalendarPlus className="w-4 h-4" />
                <span>Approve + Remind</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
