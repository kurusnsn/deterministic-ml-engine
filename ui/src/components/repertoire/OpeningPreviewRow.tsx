"use client";

import { OpeningStats } from "@/types/repertoire";

interface OpeningPreviewRowProps {
  opening: OpeningStats;
}

export default function OpeningPreviewRow({ opening }: OpeningPreviewRowProps) {
  const winratePct = (opening.winrate * 100).toFixed(1);
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex flex-col">
        <span className="font-medium text-sm">{opening.eco_code}</span>
        <span className="text-xs text-gray-500">{opening.opening_name}</span>
      </div>
      <div className="text-right text-sm">
        <div className="font-semibold text-gray-800">{opening.games_count} games</div>
        <div className="text-xs text-green-600">{winratePct}%</div>
      </div>
    </div>
  );
}
