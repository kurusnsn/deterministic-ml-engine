"use client";
import React from 'react';
import { GameResult } from '@/app/hooks/usePositionStats';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface GameModalProps {
  game: GameResult & { opponentRating?: number; playerResult?: string };
  gameType: string;
  isOpen: boolean;
  onClose: () => void;
  playerColor: 'white' | 'black';
}

export default function GameModal({ game, gameType, isOpen, onClose, playerColor }: GameModalProps) {
  if (!isOpen) return null;

  const opponentName = playerColor === 'white' ? game.black : game.white;
  const playerName = playerColor === 'white' ? game.white : game.black;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden p-0 bg-white border-0 shadow-xl gap-0 [&>button]:hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <DialogTitle className="text-xl font-bold text-gray-800">{gameType}</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {playerName} vs {opponentName} • {game.result || 'Unknown result'}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Game Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">White:</span>
                <span className="text-gray-800">{game.white || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Black:</span>
                <span className="text-gray-800">{game.black || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Result:</span>
                <span className="text-gray-800">{game.result || 'Unknown'}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Date:</span>
                <span className="text-gray-800">
                  {game.date ? new Date(game.date).toLocaleDateString() : 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Plies:</span>
                <span className="text-gray-800">{game.plies || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">Opponent Rating:</span>
                <span className="text-gray-800">{game.opponentRating || 'Unrated'}</span>
              </div>
            </div>
          </div>

          {/* PGN Display */}
          {game.pgn && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Game PGN</h3>
              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-700">
                  {game.pgn}
                </pre>
              </div>
            </div>
          )}

          {!game.pgn && (
            <div className="text-center py-8">
              <p className="text-gray-500">No PGN data available for this game.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => {
              if (game.pgn) {
                navigator.clipboard.writeText(game.pgn);
                // Could show a toast notification here
              }
            }}
            disabled={!game.pgn}
            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Copy PGN
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
