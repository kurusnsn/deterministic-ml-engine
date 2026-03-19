"use client";
import React from "react";

export default function ResultsTable({
  results,
}: {
  results: Array<{ white?: string; black?: string; result?: string }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-gray-600">
            <th className="p-2">White</th>
            <th className="p-2">Black</th>
            <th className="p-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, idx) => (
            <tr key={idx} className="border-t">
              <td className="p-2 font-mono">{r.white || "?"}</td>
              <td className="p-2 font-mono">{r.black || "?"}</td>
              <td className="p-2">{r.result || "?"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

