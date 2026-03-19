"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionId } from "@/lib/session";
import Link from "next/link";
import { useRouter } from "next/navigation";

const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL as string) || '/api/gateway';

export default function MyGamesPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [pgnCache, setPgnCache] = useState<Record<string, string>>({});
  const [pgnLoading, setPgnLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const headers: Record<string, string> = {};
        const sid = getSessionId();
        if (sid) headers['x-session-id'] = sid;
        const resp = await fetch(`${GATEWAY_URL}/games?limit=${limit}&offset=${offset}`, { headers });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load games');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [limit, offset]);

  const fetchGamePgn = useCallback(async (gameId: string | number) => {
    const id = String(gameId);
    if (pgnCache[id]) return pgnCache[id];
    try {
      setPgnLoading(prev => ({ ...prev, [id]: true }));
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;
      const resp = await fetch(`${GATEWAY_URL}/games/${id}/pgn`, { headers });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const pgn = data?.pgn || "";
      if (pgn) {
        setPgnCache(prev => ({ ...prev, [id]: pgn }));
      }
      return pgn;
    } finally {
      setPgnLoading(prev => ({ ...prev, [id]: false }));
    }
  }, [pgnCache]);

  const handleAnalyze = useCallback(async (gameId: string | number) => {
    try {
      const id = String(gameId);
      const existing = pgnCache[id];
      const pgn = existing || await fetchGamePgn(id);
      if (!pgn) throw new Error("Missing PGN");
      router.push(`/analyze?pgn=${encodeURIComponent(pgn)}`);
    } catch (e: any) {
      alert(e?.message || "Failed to load PGN");
    }
  }, [fetchGamePgn, pgnCache, router]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">My Games</h1>
      <div className="mb-2 text-sm text-muted-foreground">
        {loading ? 'Loading…' : error ? <span className="text-red-600">{error}</span> : `${items.length} games`}
      </div>
      <div className="grid gap-3">
        {items.map((g) => (
          <div key={g.id} className="border rounded p-3 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">{g.opening_name || 'Unnamed'} <span className="text-muted-foreground">{g.opening_eco || ''}</span></div>
              <div className="text-muted-foreground">
                {g.perf || g.time_control || '—'} · {g.result || '—'} · {g.provider || g.site || '—'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAnalyze(g.id)}
                disabled={!!pgnLoading[String(g.id)]}
                className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-60"
              >
                {pgnLoading[String(g.id)] ? "Loading..." : "Analyze"}
              </button>
              <Link href={`/games/${g.id}`} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm">Details</Link>
              <button
                onClick={async ()=>{
                  if (!confirm('Delete this game?')) return;
                  try {
                    const headers: Record<string, string> = {};
                    const sid = getSessionId();
                    if (sid) headers['x-session-id'] = sid;
                    const resp = await fetch(`${GATEWAY_URL}/games/${g.id}`, { method: 'DELETE', headers });
                    if (!resp.ok) throw new Error(await resp.text());
                    setItems((arr) => arr.filter((it) => it.id !== g.id));
                  } catch (e: any) {
                    alert(e?.message || 'Failed to delete');
                  }
                }}
                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-sm"
              >Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button disabled={offset===0} onClick={()=>setOffset(Math.max(0, offset - limit))} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-sm">Prev</button>
        <button onClick={()=>setOffset(offset + limit)} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm">Next</button>
        <select value={limit} onChange={(e)=>{ setOffset(0); setLimit(parseInt(e.target.value,10)); }} className="ml-2 border rounded px-2 py-1 text-sm">
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>
    </div>
  );
}
