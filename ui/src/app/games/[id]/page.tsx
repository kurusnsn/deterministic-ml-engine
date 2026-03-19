"use client";

import { useEffect, useState } from "react";
import { getSessionId } from "@/lib/session";
import { useParams } from "next/navigation";
import Link from "next/link";

const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL as string) || '/api/gateway';

export default function GameDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const headers: Record<string, string> = {};
        const sid = getSessionId();
        if (sid) headers['x-session-id'] = sid;
        const resp = await fetch(`${GATEWAY_URL}/games/${id}`, { headers });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        if (!cancelled) setGame(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load game');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (id) load();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="container mx-auto p-4">
      <Link href="/games" className="text-sm text-blue-600 hover:underline">← Back to My Games</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">Game Details</h1>
      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {game && (
        <div className="grid gap-3">
          <div className="border rounded p-3">
            <div className="font-medium">{game.opening_name || 'Unnamed'} <span className="text-muted-foreground">{game.opening_eco || ''}</span></div>
            <div className="text-muted-foreground text-sm">{game.perf || game.time_control || '—'} · {game.result || '—'} · {game.provider || game.site || '—'}</div>
          </div>
          <div className="border rounded p-3">
            <div className="mb-2 font-medium">PGN</div>
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">{game.pgn || '(no PGN)'}
            </pre>
            {game.pgn && (
              <Link href={`/analyze?pgn=${encodeURIComponent(game.pgn)}`} className="inline-block mt-3 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">Analyze</Link>
            )}
          </div>
          {game.url && (
            <div className="border rounded p-3 text-sm">
              <a href={game.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View on provider</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
