"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Menu } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/calendar")) return "Calendar View";
    if (pathname.startsWith("/chat")) return "Agent Chat Workspace";
    if (pathname.startsWith("/sync")) return "Data Sync Engine";
    if (pathname.startsWith("/settings")) return "System Settings";
    return "Command Center";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />

      <header className="bg-white border-b border-gray-200 px-8 py-5 sticky top-0 z-30 flex flex-col items-start gap-4">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-400 border-2 border-black flex items-center justify-center text-black font-black text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              RT
            </div>
            <h1 className="text-base font-black uppercase tracking-tight text-gray-900">
              RAGTAG <span className="text-gray-400 font-normal">/</span> {getPageTitle()}
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Local Air-Gapped Mode</span>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold border-2 border-black text-xs uppercase tracking-wider transition-all duration-200 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-4 h-4" />
          <span>Menu</span>
        </button>
      </header>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
};
