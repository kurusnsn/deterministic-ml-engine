"use client";
import React from "react";

export default function GameCounter({ gamesLoaded }: { gamesLoaded: number }) {
  return (
    <div className="px-3 py-2 bg-gray-100 rounded text-sm text-gray-700">
      Imported games: <span className="font-semibold">{gamesLoaded}</span>
    </div>
  );
}

