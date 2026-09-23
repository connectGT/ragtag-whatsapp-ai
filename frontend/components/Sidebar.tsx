"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  MessageSquare,
  RefreshCw,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
  }, [pathname]);

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Calendar", href: "/calendar", icon: CalendarIcon },
    { name: "Agent Chat", href: "/chat", icon: MessageSquare },
    { name: "Data Sync", href: "/sync", icon: RefreshCw },
    { name: "Settings", href: "/settings", icon: SettingsIcon },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        className={`fixed top-0 left-0 z-50 w-64 h-full bg-white border-r border-gray-200 p-6 flex flex-col justify-between transition-transform duration-300 ease-in-out shadow-2xl ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          <div className="flex items-center justify-between mb-8 pb-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-yellow-400 border-2 border-black flex items-center justify-center text-black font-black text-sm tracking-tighter shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                RT
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-gray-900 uppercase">
                  RAGTAG
                </h1>
                <p className="text-[11px] text-gray-500 font-medium">Task Command Center</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-500 hover:text-black hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                    isActive
                      ? "bg-yellow-400 text-black border border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                      : "text-gray-700 hover:text-black hover:bg-gray-100 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-gray-100 text-[11px] font-mono text-gray-500 space-y-1">
          <div className="font-bold text-gray-900 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Edge Engine Active</span>
          </div>
          <p className="text-gray-400 text-[10px]">100% Air-Gapped Local</p>
        </div>
      </aside>
    </>
  );
};
