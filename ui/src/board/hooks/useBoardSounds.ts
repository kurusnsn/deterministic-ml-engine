/**
 * Sound effects for board interactions
 *
 * Provides play functions for:
 * - Move sounds (regular moves, captures, castles, checks, promotions)
 * - Error sounds (illegal move attempts)
 */

"use client";

import useSound from "use-sound";

export interface BoardSounds {
  playMove: () => void;
  playCapture: () => void;
  playCastle: () => void;
  playCheck: () => void;
  playPromote: () => void;
  playIllegal: () => void;
}

export interface UseBoardSoundsOptions {
  volume?: number;
}

/**
 * Hook that provides sound effect functions for chess board interactions
 *
 * @param options - Configuration options (volume, etc.)
 * @returns Object with play functions for each sound type
 *
 * @example
 * ```tsx
 * const { playMove, playCapture, playCheck } = useBoardSounds();
 *
 * // In move handler:
 * if (move.captured) {
 *   playCapture();
 * } else if (game.inCheck()) {
 *   playCheck();
 * } else {
 *   playMove();
 * }
 * ```
 */
export const useBoardSounds = (options: UseBoardSoundsOptions = {}): BoardSounds => {
  const { volume = 0.5 } = options;

  const [playMove] = useSound("/sounds/move-self.mp3", { volume });
  const [playCapture] = useSound("/sounds/capture.mp3", { volume });
  const [playCastle] = useSound("/sounds/castle.mp3", { volume });
  const [playCheck] = useSound("/sounds/move-check.mp3", { volume });
  const [playPromote] = useSound("/sounds/promote.mp3", { volume });
  const [playIllegal] = useSound("/sounds/illegal.mp3", { volume });

  return {
    playMove,
    playCapture,
    playCastle,
    playCheck,
    playPromote,
    playIllegal,
  };
};

/**
 * Helper function to play the appropriate sound for a move
 *
 * @param sounds - BoardSounds object from useBoardSounds
 * @param move - The move that was made (with flags)
 * @param inCheck - Whether the opponent is now in check
 */
export const playMoveSound = (
  sounds: BoardSounds,
  move: { flags?: string; captured?: string; promotion?: string },
  inCheck: boolean
): void => {
  // Priority order: castle > check > promotion > capture > regular move
  // Check takes priority because a checking capture (e.g. Bxf7+) is more urgent to signal
  const flags = move.flags || "";

  if (flags.includes("k") || flags.includes("q")) {
    // Kingside or queenside castle
    sounds.playCastle();
  } else if (inCheck) {
    sounds.playCheck();
  } else if (move.promotion) {
    sounds.playPromote();
  } else if (move.captured) {
    sounds.playCapture();
  } else {
    sounds.playMove();
  }
};
