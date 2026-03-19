import React from "react";
import { Chess } from "chess.js";
import {
  classifyGamePhase,
  getPhaseColor,
  getPhaseIcon,
  GamePhase,
} from "@/lib/gamePhaseClassification";
import { Badge } from "@/components/ui/badge";

interface GamePhaseIndicatorProps {
  fen?: string;
  game?: Chess;
  showIcon?: boolean;
  className?: string;
}

/**
 * Display the current game phase (opening/middlegame/endgame)
 * based on material-based classification
 */
export function GamePhaseIndicator({
  fen,
  game,
  showIcon = true,
  className = "",
}: GamePhaseIndicatorProps) {
  if (!fen && !game) {
    return null;
  }

  const position = game || fen || "";
  const phase = classifyGamePhase(position);
  const colorClass = getPhaseColor(phase);
  const icon = getPhaseIcon(phase);

  return (
    <Badge
      variant="outline"
      className={`${colorClass} border-current ${className}`}
    >
      {showIcon && <span className="mr-1">{icon}</span>}
      <span className="capitalize">{phase}</span>
    </Badge>
  );
}

export default GamePhaseIndicator;
