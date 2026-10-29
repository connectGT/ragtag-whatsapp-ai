"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  Download,
  MessageSquareCode,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Inbox,
  User,
  X,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
} from "date-fns";
import { ContextModal } from "@/components/ContextModal";
import { ContextMessage } from "@/components/TaskCard";

export interface TaskItem {
  id: string;
  task_name: string;
  due_date: string | null;
  due_date_iso?: string | null;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Approved" | "Dismissed";
  extraction_mode?: string;
  context_message_id?: string | null;
  context_message?: ContextMessage | null;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // View mode and calendar state
  const [viewMode, setViewMode] = useState<"MONTH" | "WEEK">("MONTH");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Filter states
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "DISMISSED">("ALL");

  // Interaction modals
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [activeContextMsg, setActiveContextMsg] = useState<ContextMessage | null>(null);
  const [isBacklogOpen, setIsBacklogOpen] = useState<boolean>(true);

  // Extraction trigger state
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractSuccessMsg, setExtractSuccessMsg] = useState<string | null>(null);

  // Helper to parse due dates into valid Date objects
  const parseTaskDueDate = useCallback(
    (task: { due_date?: string | null; due_date_iso?: string | null }): Date | null => {
      if (task.due_date_iso) {
        try {
          const d = parseISO(task.due_date_iso);
          if (!isNaN(d.getTime())) return d;
        } catch {
          // ignore
        }
        try {
          const d = new Date(task.due_date_iso);
          if (!isNaN(d.getTime())) return d;
        } catch {
          // ignore
        }
      }

      if (task.due_date) {
        try {
          const cleaned = task.due_date.replace(" at ", " ");
          const d = new Date(cleaned);
          if (!isNaN(d.getTime())) return d;
        } catch {
          // ignore
        }
        try {
          const d = new Date(task.due_date);
          if (!isNaN(d.getTime())) return d;
        } catch {
          // ignore
        }
      }

      return null;
    },
    []
  );

  // Fetch tasks from backend
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/tasks");
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
      } else {
        setTasks([]);
      }
    } catch (err: any) {
      console.error("Failed to load calendar tasks:", err);
      setErrorMessage("Could not connect to task API. Ensure backend is running at http://127.0.0.1:5000.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Trigger task extraction on demand
  const handleExtractTasks = async () => {
    setIsExtracting(true);
    setExtractSuccessMsg(null);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/tasks/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        const count = data.new_tasks_created ?? 0;
        const upg = data.tasks_upgraded ?? 0;
        setExtractSuccessMsg(
          `Extracted ${count} new action item${count === 1 ? "" : "s"}${
            upg > 0 ? `, upgraded ${upg}` : ""
          }!`
        );
        await fetchTasks();
      }
    } catch (err) {
      console.error("Task extraction failed:", err);
    } finally {
      setIsExtracting(false);
    }
  };

  // Status update
  const handleUpdateStatus = async (
    taskId: string,
    newStatus: "Pending" | "Approved" | "Dismissed"
  ) => {
    try {
      await fetch("http://127.0.0.1:5000/api/tasks/" + taskId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.error("Failed to update status:", err);
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // Export single task to .ics
  const handleExportSingleICS = (t: TaskItem) => {
    const taskDate = parseTaskDueDate(t);
    const formattedDate = taskDate
      ? taskDate.toISOString().replace(/-|:|\.\d\d\d/g, "")
      : new Date().toISOString().replace(/-|:|\.\d\d\d/g, "");

    const sender = t.context_message?.sender_name || "WhatsApp Contact";
    const chat = t.context_message?.chat_name || "WhatsApp Chat";
    const content = t.context_message?.content || "";

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RAGTAG//Edge Task Extractor//EN",
      "BEGIN:VEVENT",
      `SUMMARY:${t.task_name.replace(/\r?\n/g, " ")}`,
      `DESCRIPTION:Extracted via RAGTAG Local AI from ${sender} in '${chat}': "${content.replace(
        /\r?\n/g,
        " "
      )}"`,
      `DTSTART:${formattedDate}`,
      `DTEND:${formattedDate}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute(
      "download",
      `${t.task_name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")}.ics`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    handleUpdateStatus(t.id, "Approved");
  };

  // Filter tasks based on priority and status
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesPriority =
        priorityFilter === "ALL" ||
        (t.priority || "").toUpperCase() === priorityFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (t.status || "").toUpperCase() === statusFilter;
      return matchesPriority && matchesStatus;
    });
  }, [tasks, priorityFilter, statusFilter]);

  // Separate scheduled vs unscheduled tasks
  const { scheduledTasks, unscheduledTasks } = useMemo(() => {
    const scheduled: Array<{ task: TaskItem; date: Date }> = [];
    const unscheduled: TaskItem[] = [];

    filteredTasks.forEach((t) => {
      const d = parseTaskDueDate(t);
      if (d) {
        scheduled.push({ task: t, date: d });
      } else {
        unscheduled.push(t);
      }
    });

    return { scheduledTasks: scheduled, unscheduledTasks: unscheduled };
  }, [filteredTasks, parseTaskDueDate]);

  // Helper to fetch tasks for a specific day
  const getTasksForDay = useCallback(
    (day: Date) => {
      return scheduledTasks
        .filter((item) => isSameDay(item.date, day))
        .map((item) => item.task);
    },
    [scheduledTasks]
  );

  // Month navigation calculations
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 }); // Saturday end
  const monthDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  );

  // Week navigation calculations
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === "MONTH") {
      setCurrentDate((prev) => subMonths(prev, 1));
    } else {
      setCurrentDate((prev) => subWeeks(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "MONTH") {
      setCurrentDate((prev) => addMonths(prev, 1));
    } else {
      setCurrentDate((prev) => addWeeks(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Badge styles
  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-500 text-white font-black border border-black";
      case "Medium":
        return "bg-amber-400 text-black font-bold border border-black";
      case "Low":
      default:
        return "bg-gray-200 text-gray-800 border border-gray-400 font-medium";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Approved":
        return "bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold";
      case "Dismissed":
        return "bg-gray-100 text-gray-400 border border-gray-300 line-through opacity-70";
      case "Pending":
      default:
        return "bg-yellow-100 text-yellow-900 border border-yellow-400 font-medium";
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header Card */}
      <div className="bg-white border-2 border-black p-8 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-yellow-400 border-2 border-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                Schedule Command Center
              </h1>
            </div>
            <p className="text-xs text-gray-600 font-mono max-w-2xl leading-relaxed">
              Interactive timeline of action items, deadlines, and project milestones extracted
              from your encrypted WhatsApp chats.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* AI Task Extraction trigger */}
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
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  <span>Extract Tasks</span>
                </>
              )}
            </button>

            {/* Refresh Tasks Button */}
            <button
              onClick={fetchTasks}
              disabled={isLoading}
              title="Refresh Deadlines"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider bg-white hover:bg-gray-100 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
          <div>
            <span className="text-[10px] font-mono uppercase text-gray-500 block">Total Tasks</span>
            <span className="text-xl font-black text-gray-900">{tasks.length}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-gray-500 block">Scheduled</span>
            <span className="text-xl font-black text-emerald-700">{scheduledTasks.length}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-gray-500 block">Unscheduled Backlog</span>
            <span className="text-xl font-black text-amber-600">{unscheduledTasks.length}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-gray-500 block">High Priority</span>
            <span className="text-xl font-black text-red-600">
              {tasks.filter((t) => t.priority === "High").length}
            </span>
          </div>
        </div>
      </div>

      {/* Success banner if task extraction was triggered */}
      {extractSuccessMsg && (
        <div className="p-4 bg-emerald-50 border-2 border-black flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-mono font-bold text-emerald-950">
              {extractSuccessMsg}
            </span>
          </div>
          <button
            onClick={() => setExtractSuccessMsg(null)}
            className="p-1 hover:bg-black/10 transition-colors text-black"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error state with retry */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border-2 border-black flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-xs font-mono font-bold text-red-950">{errorMessage}</span>
          </div>
          <button
            onClick={fetchTasks}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider"
          >
            Retry
          </button>
        </div>
      )}

      {/* Controls Bar: Navigation, View Toggle, and Filters */}
      <div className="bg-white p-6 border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-200">
          {/* Navigation Controls & Title */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <button
                onClick={handlePrev}
                title="Previous Period"
                className="p-2 hover:bg-yellow-400 border-r-2 border-black transition-colors cursor-pointer text-black"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleToday}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-yellow-400 transition-colors cursor-pointer text-black"
              >
                Today
              </button>
              <button
                onClick={handleNext}
                title="Next Period"
                className="p-2 hover:bg-yellow-400 border-l-2 border-black transition-colors cursor-pointer text-black"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <h2 className="text-xl font-black uppercase tracking-wide text-gray-900 font-mono">
              {viewMode === "MONTH"
                ? format(currentDate, "MMMM yyyy")
                : `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`}
            </h2>
          </div>

          {/* View Mode Toggle: MONTH | WEEK */}
          <div className="flex items-center border-2 border-black bg-gray-100 p-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] self-start lg:self-auto">
            <button
              onClick={() => setViewMode("MONTH")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "MONTH"
                  ? "bg-yellow-400 text-black border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  : "text-gray-600 hover:text-black"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Month</span>
            </button>
            <button
              onClick={() => setViewMode("WEEK")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === "WEEK"
                  ? "bg-yellow-400 text-black border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  : "text-gray-600 hover:text-black"
              }`}
            >
              <CalendarRange className="w-4 h-4" />
              <span>Week</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Priority Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold uppercase text-gray-500 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Priority:</span>
            </span>
            {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => {
              const isActive = priorityFilter === p;
              return (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? "bg-black text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold uppercase text-gray-500 mr-1">
              Status:
            </span>
            {(["ALL", "PENDING", "APPROVED", "DISMISSED"] as const).map((s) => {
              const isActive = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? "bg-black text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid: MONTH VIEW */}
      {viewMode === "MONTH" && (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* Day of Week Headers (Sun through Sat) */}
          <div className="grid grid-cols-7 border-b-2 border-black bg-black text-white text-center">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((dayName) => (
              <div
                key={dayName}
                className="py-3 text-xs font-black uppercase tracking-wider font-mono"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Monthly Matrix of 7 Columns */}
          <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 gap-px border-b border-black">
            {monthDays.map((day, idx) => {
              const dayTasks = getTasksForDay(day);
              const inCurrentMonth = isSameMonth(day, currentDate);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={idx}
                  className={`min-h-[120px] p-2 flex flex-col justify-between transition-colors ${
                    isCurrentDay
                      ? "bg-yellow-50/90 border-2 border-black"
                      : inCurrentMonth
                      ? "bg-white hover:bg-gray-50/80"
                      : "bg-gray-50/70 text-gray-400"
                  }`}
                >
                  {/* Date Header in Cell */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-mono font-bold inline-block px-1.5 py-0.5 ${
                        isCurrentDay
                          ? "bg-black text-yellow-400 font-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                          : inCurrentMonth
                          ? "text-gray-900"
                          : "text-gray-400"
                      }`}
                    >
                      {format(day, "d")}
                    </span>

                    {isCurrentDay && (
                      <span className="text-[9px] font-black uppercase tracking-wider bg-yellow-400 text-black px-1 border border-black">
                        TODAY
                      </span>
                    )}

                    {dayTasks.length > 0 && (
                      <span className="text-[10px] font-mono text-gray-500 font-bold">
                        {dayTasks.length} {dayTasks.length === 1 ? "task" : "tasks"}
                      </span>
                    )}
                  </div>

                  {/* Tasks Plotted in Cell */}
                  <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[140px] pr-0.5">
                    {dayTasks.slice(0, 3).map((task) => {
                      const taskDate = parseTaskDueDate(task);
                      const timeStr = taskDate ? format(taskDate, "HH:mm") : "";

                      return (
                        <button
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={`w-full text-left p-1.5 text-[11px] leading-tight transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] ${getPriorityBadgeClass(
                            task.priority
                          )}`}
                          title={`${task.task_name} (${task.priority} Priority, ${task.status})`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-[9px] font-mono uppercase tracking-wider font-black">
                              {task.priority[0]} • {timeStr || "TBD"}
                            </span>
                            {task.status === "Approved" && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-900 shrink-0" />
                            )}
                          </div>
                          <p className="font-semibold line-clamp-2 truncate">{task.task_name}</p>
                        </button>
                      );
                    })}

                    {dayTasks.length > 3 && (
                      <button
                        onClick={() => setSelectedTask(dayTasks[3])}
                        className="w-full text-center py-1 text-[10px] font-mono font-bold bg-gray-100 hover:bg-gray-200 border border-gray-400 text-gray-800 uppercase tracking-wider"
                      >
                        +{dayTasks.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid: WEEK VIEW */}
      {viewMode === "WEEK" && (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x-2 divide-black">
            {weekDays.map((day, idx) => {
              const dayTasks = getTasksForDay(day);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={idx}
                  className={`min-h-[360px] p-4 flex flex-col ${
                    isCurrentDay ? "bg-yellow-50/50" : "bg-white"
                  }`}
                >
                  {/* Day Header */}
                  <div
                    className={`pb-3 mb-4 border-b-2 border-black flex md:flex-col justify-between items-start ${
                      isCurrentDay ? "bg-yellow-100/70 p-2 -mx-2 -mt-2 border-b-2" : ""
                    }`}
                  >
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-gray-500 font-mono block">
                        {format(day, "EEEE")}
                      </span>
                      <span className="text-lg font-black text-gray-900 font-mono">
                        {format(day, "MMM d")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1">
                      {isCurrentDay && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-black text-yellow-400 px-1.5 py-0.5">
                          TODAY
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-gray-100 border border-black font-bold">
                        {dayTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Task Cards in Week Column */}
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {dayTasks.map((task) => {
                      const taskDate = parseTaskDueDate(task);
                      const timeStr = taskDate ? format(taskDate, "h:mm a") : "";

                      return (
                        <div
                          key={task.id}
                          className="bg-white border-2 border-black p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] space-y-2 hover:bg-yellow-50/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span
                              className={`text-[9px] px-2 py-0.5 uppercase tracking-wider font-bold ${getPriorityBadgeClass(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 uppercase ${getStatusBadgeClass(
                                task.status
                              )}`}
                            >
                              {task.status}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-2">
                            {task.task_name}
                          </h4>

                          {timeStr && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-700 font-mono">
                              <Clock className="w-3 h-3 text-black" />
                              <span>{timeStr}</span>
                            </div>
                          )}

                          <div className="text-[10px] text-gray-500 font-mono truncate">
                            {task.context_message?.chat_name || "Direct Message"}
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <button
                              onClick={() => setSelectedTask(task)}
                              className="text-[10px] font-bold uppercase tracking-wider text-black hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <span>Inspect</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                            {task.status !== "Approved" && (
                              <button
                                onClick={() => handleExportSingleICS(task)}
                                className="p-1 hover:bg-emerald-100 text-emerald-800 transition-colors"
                                title="Approve & Export .ics"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {dayTasks.length === 0 && (
                      <div className="h-32 border border-dashed border-gray-300 flex items-center justify-center p-4 text-center">
                        <span className="text-[10px] font-mono text-gray-400 uppercase">
                          No Deadlines
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collapsible Unscheduled / Backlog Tasks Drawer */}
      <div className="bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <button
          onClick={() => setIsBacklogOpen(!isBacklogOpen)}
          className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors border-b-2 border-black cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-400 border border-black text-black">
              <Inbox className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-900">
                Unscheduled Action Items / Backlog
              </h3>
              <p className="text-[11px] text-gray-500 font-mono">
                Tasks extracted without a deterministic deadline date
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-black text-white text-xs font-mono font-bold">
              {unscheduledTasks.length} {unscheduledTasks.length === 1 ? "task" : "tasks"}
            </span>
            {isBacklogOpen ? (
              <ChevronUp className="w-5 h-5 text-black" />
            ) : (
              <ChevronDown className="w-5 h-5 text-black" />
            )}
          </div>
        </button>

        {isBacklogOpen && (
          <div className="p-6">
            {unscheduledTasks.length === 0 ? (
              <div className="text-center py-8 text-xs font-mono text-gray-500">
                All action items have scheduled calendar deadlines!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unscheduledTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 bg-gray-50 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[9px] px-2 py-0.5 uppercase tracking-wider font-bold ${getPriorityBadgeClass(
                            t.priority
                          )}`}
                        >
                          {t.priority}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 uppercase ${getStatusBadgeClass(
                            t.status
                          )}`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 line-clamp-2">
                        {t.task_name}
                      </h4>
                      {t.context_message && (
                        <p className="text-[11px] text-gray-600 italic mt-1 line-clamp-2 font-serif">
                          &ldquo;{t.context_message.content}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-gray-200 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-gray-500 truncate">
                        {t.context_message?.sender_name || "Unknown"}
                      </span>
                      <button
                        onClick={() => setSelectedTask(t)}
                        className="px-2 py-1 bg-white hover:bg-gray-200 border border-black font-bold text-black uppercase cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Detail Modal / Provenance Trace */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-black text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white font-mono">
                  Task Detail & Calendar Provenance
                </h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs px-2.5 py-0.5 uppercase tracking-wider font-bold ${getPriorityBadgeClass(
                      selectedTask.priority
                    )}`}
                  >
                    {selectedTask.priority} Priority
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 uppercase ${getStatusBadgeClass(
                      selectedTask.status
                    )}`}
                  >
                    {selectedTask.status}
                  </span>
                </div>
                <h2 className="text-xl font-black text-gray-900 leading-tight">
                  {selectedTask.task_name}
                </h2>
              </div>

              {/* Deadline & Chat Metadata */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-300 text-xs">
                <div>
                  <span className="text-gray-500 font-mono block mb-0.5">DUE DATE:</span>
                  <span className="font-bold text-gray-900 font-mono flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-black" />
                    <span>{selectedTask.due_date || "No scheduled time"}</span>
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-mono block mb-0.5">CHAT SOURCE:</span>
                  <span className="font-bold text-gray-900">
                    {selectedTask.context_message?.chat_name || "Direct Message"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-mono block mb-0.5">SENDER:</span>
                  <span className="font-bold text-gray-900 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-black" />
                    <span>{selectedTask.context_message?.sender_name || "Unknown"}</span>
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-mono block mb-0.5">EXTRACTION ENGINE:</span>
                  <span className="font-mono text-gray-900 uppercase">
                    {selectedTask.extraction_mode || "Local Rule Engine"}
                  </span>
                </div>
              </div>

              {/* Verbatim Excerpt */}
              {selectedTask.context_message && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Extracted Source WhatsApp Message:
                  </span>
                  <div className="p-4 bg-gray-50 border-l-4 border-l-yellow-400 border-y border-r border-gray-300">
                    <p className="text-xs font-serif italic text-gray-800 leading-relaxed">
                      &ldquo;{selectedTask.context_message.content}&rdquo;
                    </p>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => {
                    if (selectedTask.context_message) {
                      setActiveContextMsg(selectedTask.context_message);
                    }
                  }}
                  disabled={!selectedTask.context_message}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider bg-white hover:bg-gray-100 text-black border border-black cursor-pointer disabled:opacity-50"
                >
                  <MessageSquareCode className="w-4 h-4 text-black" />
                  <span>View Source Message</span>
                </button>

                <div className="flex items-center gap-2">
                  {selectedTask.status !== "Dismissed" && (
                    <button
                      onClick={() => handleUpdateStatus(selectedTask.id, "Dismissed")}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-bold uppercase tracking-wider bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleExportSingleICS(selectedTask)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-black" />
                    <span>
                      {selectedTask.status === "Approved" ? "Re-Export .ics" : "Approve & Export .ics"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-100 border-t border-gray-300 flex justify-end">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-5 py-2 text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-gray-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ground Truth Context Trace Modal */}
      <ContextModal
        message={activeContextMsg}
        onClose={() => setActiveContextMsg(null)}
      />
    </div>
  );
}

