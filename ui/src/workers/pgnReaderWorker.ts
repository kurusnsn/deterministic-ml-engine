// Minimal worker that emits games one-by-one back to main thread

type Game = { pgn?: string; white?: { username?: string }; black?: { username?: string }; result?: string };

let stopped = false;

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (!data) return;
  if (data.type === 'start') {
    stopped = false;
    const games: Game[] = data.games || [];
    for (let i = 0; i < games.length; i++) {
      if (stopped) break;
      // post one game at a time
      (self as unknown as Worker).postMessage({ type: 'game', game: games[i] });
      // yield
      await new Promise((r) => setTimeout(r, 0));
    }
    (self as unknown as Worker).postMessage({ type: 'done' });
  } else if (data.type === 'stop') {
    stopped = true;
  }
};

