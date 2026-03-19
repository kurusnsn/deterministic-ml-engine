export const DP_TABLE: Record<string, number> = {
  "100": 800, "99": 677, "98": 589, "97": 538, "96": 501, "95": 470,
  "94": 444, "93": 422, "92": 401, "91": 383, "90": 366, "89": 351,
  "88": 336, "87": 322, "86": 309, "85": 296, "84": 284, "83": 273,
  "82": 262, "81": 251, "80": 240, "79": 230, "78": 220, "77": 211,
  "76": 202, "75": 193, "74": 184, "73": 175, "72": 166, "71": 158,
  "70": 149, "69": 141, "68": 133, "67": 125, "66": 117, "65": 110,
  "64": 102, "63": 95, "62": 87, "61": 80, "60": 72, "59": 65,
  "58": 57, "57": 50, "56": 43, "55": 36, "54": 29, "53": 21,
  "52": 14, "51": 7, "50": 0, "49": -7, "48": -14, "47": -21,
  "46": -29, "45": -36, "44": -43, "43": -50, "42": -57, "41": -65,
  "40": -72, "39": -80, "38": -87, "37": -95, "36": -102, "35": -110,
  "34": -117, "33": -125, "32": -133, "31": -141, "30": -149, "29": -158,
  "28": -166, "27": -175, "26": -184, "25": -193, "24": -202, "23": -211,
  "22": -220, "21": -230, "20": -240, "19": -251, "18": -262, "17": -273,
  "16": -284, "15": -296, "14": -309, "13": -322, "12": -336, "11": -351,
  "10": -366, "9": -383, "8": -401, "7": -422, "6": -444, "5": -470,
  "4": -501, "3": -538, "2": -589, "1": -677, "0": -800,
};

export function getPerformanceDetails(
  totalOpponentElo: number | undefined,
  averageElo: number | undefined,
  white: number,
  draws: number,
  black: number,
  playerColor: 'white' | 'black'
) {
  const totalGames = Math.max(1, white + draws + black);
  const averageOpponentElo = totalOpponentElo ? Math.round(totalOpponentElo / totalGames) : undefined;
  const playerWins = playerColor === 'black' ? black : white;
  // const playerLosses = playerColor === 'black' ? white : black;
  const score = playerWins + draws / 2;
  const scorePercentage = (score * 100) / totalGames;
  const key = String(Math.round(scorePercentage)) as keyof typeof DP_TABLE;
  const ratingChange = DP_TABLE[key] ?? 0;
  const performanceRating = averageOpponentElo ? averageOpponentElo + ratingChange : undefined;

  return {
    results: `${white}-${black}-${draws}`,  // W-L-D format (wins-losses-draws)
    performanceRating,
    averageOpponentElo,
    averageElo,
    scoreLabel: `${Number.isInteger(scorePercentage) ? scorePercentage : scorePercentage.toFixed(1)}% for ${playerColor}`,
    ratingChange,
  };
}

