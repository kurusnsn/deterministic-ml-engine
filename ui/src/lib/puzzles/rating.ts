export function updateRating(userRating: number, puzzleRating: number, correct: boolean, k: number = 20): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - userRating) / 400));
  const result = correct ? 1 : 0;
  const next = Math.round(userRating + k * (result - expected));
  return Math.max(400, next);
}
