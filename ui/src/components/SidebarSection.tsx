"use client";
import React, { ReactNode } from "react";

export default function SidebarSection({
  title,
  children,
  isExpanded,
  onToggle,
}: {
  title: string;
  children: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-4 bg-white dark:bg-zinc-900 rounded-lg shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="flex justify-between items-center w-full p-4 text-left font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-750 transition-colors duration-200 rounded-t-lg focus:outline-none"
      >
        <span>{title}</span>
        <span>{isExpanded ? "" : ""}</span>
      </button>
      {isExpanded && <div className="p-4 border-t border-gray-200 dark:border-zinc-800">{children}</div>}
    </div>
  );
}

