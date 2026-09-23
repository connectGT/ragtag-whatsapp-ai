"use client";

import React from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";

export default function CalendarPage() {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-300 p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-yellow-400 border border-black text-black">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
            Calendar View
          </h1>
        </div>
        <p className="text-sm text-gray-600 font-medium max-w-2xl">
          Calendar & Schedule Sync: Review exported .ics calendar events, upcoming WhatsApp deadlines, and automated schedule integrations.
        </p>
      </div>

      <div className="bg-white border border-gray-300 p-12 text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 bg-gray-100 border border-gray-300 flex items-center justify-center mx-auto text-gray-700">
          <Clock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
          Upcoming Schedule Timeline
        </h2>
        <p className="text-xs text-gray-500 font-mono max-w-md mx-auto leading-relaxed">
          Approved tasks from your WhatsApp chats automatically export to .ics format. Full interactive calendar grid integration coming soon.
        </p>
      </div>
    </div>
  );
}
