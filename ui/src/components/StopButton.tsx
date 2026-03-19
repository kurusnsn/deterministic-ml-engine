"use client";
import React from "react";

export default function StopButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 text-white rounded text-sm ${
        disabled 
          ? 'bg-gray-400 cursor-not-allowed' 
          : 'bg-red-500 hover:bg-red-600'
      }`}
    >
      {disabled ? 'Stopping...' : 'Stop'}
    </button>
  );
}

