import React from "react";

interface EvaluationBarProps {
  evalScore: string | null;
  orientation: "white" | "black";
}

const EvaluationBar: React.FC<EvaluationBarProps> = ({ evalScore, orientation }) => {
  // console.log("EvaluationBar:", { evalScore, orientation });
  let whiteWinningChance = 50;
  let numericScore = 0.0;
  let isMate = false;
  let badgeText = "0.00";

  if (evalScore) {
    if (evalScore.startsWith('#')) {
      isMate = true;
      // Parse mate score (e.g., "#3" or "#-3")
      // Positive = White mates, Negative = Black mates
      const mateIn = parseInt(evalScore.slice(1)) || 0;
      const absoluteMate = mateIn;

      // Calculate winning chance: White mates (>0) -> 100%, Black mates (<0) -> 0%
      whiteWinningChance = absoluteMate > 0 ? 100 : 0;
      numericScore = absoluteMate;
      badgeText = `M${Math.abs(absoluteMate)}`;
    } else {
      // Centipawn eval - Assumed to be White-relative
      const rawScore = parseFloat(evalScore) || 0;
      const whiteScore = rawScore;
      numericScore = whiteScore;

      // Convert to centipawns (1.0 = 100 cp)
      const cp = whiteScore * 100;

      // Apply Lichess sigmoid formula
      whiteWinningChance = 100 / (1 + Math.exp(-0.00368208 * cp));

      // Format badge text
      // Removed +/- signs as per user request
      badgeText = `${Math.abs(numericScore).toFixed(2)}`;
      if (Math.abs(numericScore) < 0.01) badgeText = "0.00";
    }
  }

  // Determine badge position and color
  const isWhiteWinning = whiteWinningChance >= 50;

  // Badge styling
  const badgeBaseClasses = "absolute text-[10px] font-bold px-1.5 py-0.5 rounded-sm z-10 tabular-nums transition-all duration-500";
  const badgeColorClasses = isWhiteWinning
    ? "text-black bg-white/95" // Inside White bar
    : "text-white bg-black";    // Inside Black bar

  let badgePositionClasses = "";

  if (orientation === 'white') {
    // White Bottom, Black Top
    if (isWhiteWinning) {
      // Inside White (Bottom)
      badgePositionClasses = "bottom-1 left-1/2 -translate-x-1/2";
    } else {
      // Inside Black (Top)
      badgePositionClasses = "top-1 left-1/2 -translate-x-1/2";
    }
  } else {
    // Orientation Black: White Top, Black Bottom
    if (isWhiteWinning) {
      // Inside White (Top)
      badgePositionClasses = "top-1 left-1/2 -translate-x-1/2";
    } else {
      // Inside Black (Bottom)
      badgePositionClasses = "bottom-1 left-1/2 -translate-x-1/2";
    }
  }

  return (
    <div className="h-full w-full bg-black relative flex flex-col items-center overflow-hidden border border-neutral-400 dark:border-neutral-600">
      {/* White Bar */}
      <div
        className="w-full bg-white transition-all duration-500 absolute"
        style={{
          height: `${whiteWinningChance}%`,
          // If orientation is white, White grows from Bottom.
          // If orientation is black, White grows from Top.
          top: orientation === 'black' ? 0 : 'auto',
          bottom: orientation === 'white' ? 0 : 'auto',
        }}
      />

      {/* Score Badge */}
      <div className={`${badgeBaseClasses} ${badgeColorClasses} ${badgePositionClasses}`}>
        {badgeText}
      </div>
    </div>
  );
};

export default EvaluationBar;