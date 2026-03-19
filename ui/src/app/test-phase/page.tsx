"use client";

import React, { useState } from "react";
import { Chess } from "chess.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GamePhaseIndicator from "@/components/GamePhaseIndicator";
import { classifyGamePhaseDetailed } from "@/lib/gamePhaseClassification";

/**
 * Test page for Game Phase Classification
 * Navigate to: /test-phase
 */
export default function TestGamePhasePage() {
  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [error, setError] = useState<string | null>(null);

  const testPositions = [
    {
      name: "Starting Position (Opening)",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      expectedPhase: "opening",
    },
    {
      name: "Italian Game (Opening)",
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
      expectedPhase: "opening",
    },
    {
      name: "After Trades (Middlegame)",
      fen: "r2q1rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R2QR1K1 w - - 0 10",
      expectedPhase: "middlegame",
    },
    {
      name: "One Queen Traded (Middlegame)",
      fen: "r4rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R3R1K1 w - - 0 12",
      expectedPhase: "middlegame",
    },
    {
      name: "Rook Endgame (Endgame)",
      fen: "8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40",
      expectedPhase: "endgame",
    },
    {
      name: "Queen + Pawn Endgame (Endgame)",
      fen: "8/5pk1/6p1/8/8/6P1/3Q1PK1/8 w - - 0 40",
      expectedPhase: "endgame",
    },
    {
      name: "King + Pawn (Endgame)",
      fen: "8/5pk1/8/8/8/8/5PK1/8 w - - 0 50",
      expectedPhase: "endgame",
    },
  ];

  const loadPosition = (position: string) => {
    try {
      const game = new Chess(position);
      setFen(game.fen());
      setError(null);
    } catch (e) {
      setError("Invalid FEN position");
    }
  };

  let details;
  let game;
  try {
    game = new Chess(fen);
    details = classifyGamePhaseDetailed(game);
    if (error) setError(null);
  } catch (e) {
    if (!error) setError("Invalid FEN");
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Game Phase Classification Test</h1>
      <p className="text-gray-600 mb-6">
        Test the material-based game phase classifier (Opening / Middlegame / Endgame)
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Input & Current Phase */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Position</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="fen-position" id="fen-position-label" className="block text-sm font-medium mb-2">
                  FEN Position
                </Label>
                <Input
                  id="fen-position"
                  aria-labelledby="fen-position-label"
                  aria-describedby={error ? "fen-position-error" : undefined}
                  aria-invalid={Boolean(error)}
                  value={fen}
                  onChange={(e) => setFen(e.target.value)}
                  placeholder="Enter FEN position..."
                  className="font-mono text-sm"
                />
                {error && (
                  <p id="fen-position-error" role="alert" className="text-red-500 text-sm mt-1">
                    {error}
                  </p>
                )}
              </div>

              {details && game && (
                <>
                  <div className="flex items-center gap-3 pt-4 border-t">
                    <span className="text-sm font-medium">Game Phase:</span>
                    <GamePhaseIndicator game={game} showIcon={true} />
                  </div>

                  <div className="space-y-2 pt-2">
                    <h2 className="font-semibold text-sm">Material Breakdown</h2>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>White: {details.material.white}</div>
                      <div>Black: {details.material.black}</div>
                      <div>Total: {details.material.total}</div>
                      <div>Difference: {details.material.difference}</div>
                      <div className="col-span-2">Queens: {details.material.queenCount}</div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <h2 className="font-semibold text-sm">Classification Conditions</h2>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        {details.conditions.isOpening ? "✅" : "❌"}
                        <span>Opening Criteria</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {details.conditions.isEndgameConditionA ? "✅" : "❌"}
                        <span>Endgame A (No queens, mat ≤ 20)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {details.conditions.isEndgameConditionB ? "✅" : "❌"}
                        <span>Endgame B (1 queen, mat ≤ 12)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {details.conditions.isEndgameConditionC ? "✅" : "❌"}
                        <span>Endgame C (mat ≤ 15)</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Test Positions */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Test Positions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {testPositions.map((pos, index) => (
                <Button
                  key={index}
                  onClick={() => loadPosition(pos.fen)}
                  variant={fen === pos.fen ? "default" : "outline"}
                  className="w-full justify-start text-left h-auto py-3"
                >
                  <div className="flex flex-col items-start w-full">
                    <div className="font-semibold">{pos.name}</div>
                    <div className="text-xs text-gray-500 mt-1 font-mono truncate w-full">
                      {pos.fen}
                    </div>
                    <div className="text-xs mt-1 text-gray-600">
                      Expected: <span className="capitalize">{pos.expectedPhase}</span>
                    </div>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Algorithm Reference */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Algorithm Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>Piece Values:</strong> P=1, N=3, B=3, R=5, Q=9, K=0
          </div>
          <div>
            <strong>Opening:</strong> Both queens on board AND material ≥ 46 AND difference ≤ 3
          </div>
          <div>
            <strong>Endgame (any of):</strong>
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>No queens AND material ≤ 20</li>
              <li>One queen AND material ≤ 12</li>
              <li>Material ≤ 15 (regardless of queens)</li>
            </ul>
          </div>
          <div>
            <strong>Middlegame:</strong> Everything else
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
