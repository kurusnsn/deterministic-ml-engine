'use client';

import { useEffect } from 'react';

export default function TestPage() {
  useEffect(() => {
    const stockfish = new Worker('/stockfish.worker.js');

    const sendCommand = (cmd: string) => {
      stockfish.postMessage(cmd);
    };

    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    function toHumanScore(cp: number): number {
      const scaled = cp * 10;
      return scaled >= 0 ? Math.ceil(scaled) : Math.floor(scaled);
    }

    const evaluateWithMultiPV = () =>
      new Promise<
        { move: string; cp: number; score: number }[]
      >((resolve) => {
        const multipvMap = new Map<number, { move: string; cp: number; score: number }>();

        const handler = (event: MessageEvent) => {
          const line = event.data;

          if (line.startsWith('info') && line.includes(' pv ')) {
            const match = line.match(/multipv (\d+).*?score (cp|mate) (-?\d+).*? pv (\S+)/);
            if (match) {
              const pvNum = parseInt(match[1], 10);
              const scoreType = match[2];
              const scoreVal = parseInt(match[3], 10);
              const move = match[4];

              let cp: number;
              if (scoreType === 'cp') {
                cp = scoreVal / 100;
              } else {
                cp = scoreVal > 0 ? 100 : -100; // use ±100 for mate
              }

              const score = toHumanScore(cp);

              multipvMap.set(pvNum, { move, cp, score });
            }
          } else if (line.startsWith('bestmove')) {
            stockfish.removeEventListener('message', handler);
            const results = Array.from(multipvMap.values()).sort((a, b) => b.cp - a.cp);
            resolve(results);
          }
        };

        stockfish.addEventListener('message', handler);

        sendCommand('uci');
        sendCommand('ucinewgame');
        sendCommand('isready');
        sendCommand('setoption name MultiPV value 20');
        sendCommand(`position fen ${fen}`);
        sendCommand('go movetime 1000');
      });

    const runEval = async () => {
      const results = await evaluateWithMultiPV();
      console.table(results);
    };

    runEval();
  }, []);

  return (
    <div className="p-4">
      <h1 className="sr-only">Test</h1>
      Check the console for multipv evaluations
    </div>
  );
}
