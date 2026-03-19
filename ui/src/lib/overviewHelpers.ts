import { OpeningStats, TimeUsageEntry, GameLengthHistogramEntry } from '@/types/repertoire';

// ============================================================
// TYPES
// ============================================================

export interface OpeningWithRelevance extends OpeningStats {
  relevance_score: number;
  loss_rate: number;
  early_loss_count?: number;
  slow_loss_avg_time?: number;
}

export interface InsightData {
  type: 'warning' | 'suggestion' | 'strength';
  message: string;
  opening_eco?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AvgMoveTimeByResult {
  result: 'Wins' | 'Draws' | 'Losses';
  avgTime: number;
}

export interface GameLengthBin {
  bucket: string;
  wins: number;
  draws: number;
  losses: number;
}

export interface ClusterStats {
  clusterName: string;
  wins: number;
  draws: number;
  losses: number;
  games: number;
  winrate: number;
  avgScore: number; // 1 for win, 0.5 for draw, 0 for loss
}

export interface RepertoireSignals {
  eco_code: string;
  opening_name: string;
  color: 'white' | 'black';
  // CORE signals
  high_winrate: boolean;
  stable_move_time: boolean;
  balanced_game_length: boolean;
  high_frequency: boolean;
  // REPAIR signals
  high_frequency_low_winrate: boolean;
  many_early_losses: boolean;
  slow_in_losses: boolean;
  repeated_poor_results: boolean;
  // EXPANSION signals
  low_frequency_high_winrate: boolean;
  strong_move_time_stability: boolean;
  performs_well_in_long_games: boolean;
  // EXPERIMENTAL signals
  low_frequency_low_winrate: boolean;
  very_fast_losses: boolean;
  slow_unfamiliar: boolean;
  // DEVELOPING signals
  moderate_frequency: boolean;
  moderate_winrate: boolean;
  no_severe_weaknesses: boolean;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get the color of an opening based on its properties
 */
export function getOpeningColor(opening: OpeningStats): 'white' | 'black' {
  return opening.color;
}

/**
 * Shorten opening name for display
 */
export function shortenOpeningName(name: string, max: number = 18): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}

/**
 * Aggregate stats for both colors
 */
export function aggregateStatsForBothColor(
  whiteStats: OpeningStats[],
  blackStats: OpeningStats[]
): OpeningStats[] {
  const ecoMap = new Map<string, OpeningStats>();

  // Process white openings
  whiteStats.forEach(opening => {
    const key = opening.eco_code;
    ecoMap.set(key, { ...opening });
  });

  // Process black openings
  blackStats.forEach(opening => {
    const key = opening.eco_code;
    const existing = ecoMap.get(key);

    if (existing) {
      // Merge stats
      ecoMap.set(key, {
        ...existing,
        games_count: existing.games_count + opening.games_count,
        wins: existing.wins + opening.wins,
        losses: existing.losses + opening.losses,
        draws: existing.draws + opening.draws,
        winrate: (existing.wins + opening.wins) / (existing.games_count + opening.games_count),
        frequency: (existing.frequency + opening.frequency) / 2,
        color: 'white', // Keep as white for display purposes
      });
    } else {
      ecoMap.set(key, { ...opening });
    }
  });

  return Array.from(ecoMap.values());
}

/**
 * Compute average move time by result
 */
export function computeAvgMoveTimeByResult(
  timeUsage: TimeUsageEntry[],
  filteredOpenings?: OpeningStats[]
): AvgMoveTimeByResult[] {
  const resultTimes: Record<'win' | 'loss' | 'draw', number[]> = {
    win: [],
    loss: [],
    draw: [],
  };

  // Filter time usage entries if openings are provided
  let entries = timeUsage;
  if (filteredOpenings && filteredOpenings.length > 0) {
    const openingEcos = new Set(filteredOpenings.map(o => o.eco_code));
    entries = timeUsage.filter(entry => {
      // Extract ECO from opening string (format: "ECO Opening Name")
      const ecoMatch = entry.opening?.match(/^([A-E]\d{2})/);
      return ecoMatch && openingEcos.has(ecoMatch[1]);
    });
  }

  // Aggregate times by result
  entries.forEach(entry => {
    if (entry.avg_move_time && entry.avg_move_time > 0) {
      resultTimes[entry.result].push(entry.avg_move_time);
    }
  });

  // Calculate averages
  const avgWins = resultTimes.win.length > 0
    ? resultTimes.win.reduce((a, b) => a + b, 0) / resultTimes.win.length
    : 0;
  const avgDraws = resultTimes.draw.length > 0
    ? resultTimes.draw.reduce((a, b) => a + b, 0) / resultTimes.draw.length
    : 0;
  const avgLosses = resultTimes.loss.length > 0
    ? resultTimes.loss.reduce((a, b) => a + b, 0) / resultTimes.loss.length
    : 0;

  return [
    { result: 'Wins', avgTime: avgWins },
    { result: 'Draws', avgTime: avgDraws },
    { result: 'Losses', avgTime: avgLosses },
  ];
}

/**
 * Compute game length bins
 */
export function computeGameLengthBins(
  histogram: GameLengthHistogramEntry[],
  color: 'white' | 'black' | 'all'
): GameLengthBin[] {
  // Define standard buckets
  const buckets = ['0-20', '21-40', '41-60', '60+'];
  const bins: GameLengthBin[] = buckets.map(bucket => ({
    bucket,
    wins: 0,
    draws: 0,
    losses: 0,
  }));

  // Map histogram entries to bins
  histogram.forEach(entry => {
    const binIndex = buckets.indexOf(entry.bucket);
    if (binIndex >= 0) {
      bins[binIndex].wins += entry.wins;
      bins[binIndex].draws += entry.draws;
      bins[binIndex].losses += entry.losses;
    }
  });

  return bins;
}

/**
 * Calculate relevance score for an opening
 */
function calculateRelevanceScore(
  opening: OpeningStats,
  allOpenings: OpeningStats[],
  timeUsage: TimeUsageEntry[]
): OpeningWithRelevance {
  // Sort by frequency for ranking
  const sortedByFreq = [...allOpenings].sort((a, b) => b.frequency - a.frequency);
  const freqRank = sortedByFreq.findIndex(o => o.eco_code === opening.eco_code) + 1;
  const freqScore = 1 - (freqRank - 1) / allOpenings.length;

  // Calculate loss rate
  const lossRate = opening.games_count > 0 ? opening.losses / opening.games_count : 0;
  const sortedByLossRate = [...allOpenings].sort((a, b) => {
    const aRate = a.games_count > 0 ? a.losses / a.games_count : 0;
    const bRate = b.games_count > 0 ? b.losses / b.games_count : 0;
    return bRate - aRate;
  });
  const lossRateRank = sortedByLossRate.findIndex(o => o.eco_code === opening.eco_code) + 1;
  const lossRateScore = 1 - (lossRateRank - 1) / allOpenings.length;

  // Calculate early loss count (losses in games < 25 moves)
  const openingGames = timeUsage.filter(entry => {
    const ecoMatch = entry.opening?.match(/^([A-E]\d{2})/);
    return ecoMatch && ecoMatch[1] === opening.eco_code;
  });
  const earlyLosses = openingGames.filter(
    entry => entry.result === 'loss' && entry.moves && entry.moves < 25
  ).length;
  const earlyLossCount = earlyLosses;

  const sortedByEarlyLoss = [...allOpenings].map(o => {
    const games = timeUsage.filter(entry => {
      const ecoMatch = entry.opening?.match(/^([A-E]\d{2})/);
      return ecoMatch && ecoMatch[1] === o.eco_code;
    });
    const early = games.filter(
      entry => entry.result === 'loss' && entry.moves && entry.moves < 25
    ).length;
    return { eco: o.eco_code, count: early };
  }).sort((a, b) => b.count - a.count);

  const earlyLossRank = sortedByEarlyLoss.findIndex(o => o.eco === opening.eco_code) + 1;
  const earlyLossScore = 1 - (earlyLossRank - 1) / allOpenings.length;

  // Calculate slow loss average time
  const lossGames = openingGames.filter(entry => entry.result === 'loss' && entry.avg_move_time);
  const slowLossAvgTime = lossGames.length > 0
    ? lossGames.reduce((sum, entry) => sum + (entry.avg_move_time || 0), 0) / lossGames.length
    : 0;

  const sortedBySlowLoss = [...allOpenings].map(o => {
    const games = timeUsage.filter(entry => {
      const ecoMatch = entry.opening?.match(/^([A-E]\d{2})/);
      return ecoMatch && ecoMatch[1] === o.eco_code;
    });
    const losses = games.filter(entry => entry.result === 'loss' && entry.avg_move_time);
    const avg = losses.length > 0
      ? losses.reduce((sum, entry) => sum + (entry.avg_move_time || 0), 0) / losses.length
      : 0;
    return { eco: o.eco_code, avg };
  }).sort((a, b) => b.avg - a.avg);

  const slowLossRank = sortedBySlowLoss.findIndex(o => o.eco === opening.eco_code) + 1;
  const slowLossScore = 1 - (slowLossRank - 1) / allOpenings.length;

  // Calculate final relevance score
  const relevanceScore =
    0.4 * freqScore +
    0.3 * lossRateScore +
    0.2 * earlyLossScore +
    0.1 * slowLossScore;

  return {
    ...opening,
    relevance_score: relevanceScore,
    loss_rate: lossRate,
    early_loss_count: earlyLossCount,
    slow_loss_avg_time: slowLossAvgTime,
  };
}

/**
 * Get top openings by relevance score
 */
export function getTopOpenings(
  openings: OpeningStats[],
  color: 'white' | 'black' | 'all',
  timeUsage: TimeUsageEntry[],
  limit: number = 5
): OpeningWithRelevance[] {
  // Filter by color
  let filtered = openings;
  if (color !== 'all') {
    filtered = openings.filter(o => o.color === color);
  }

  // Calculate relevance scores
  const withRelevance = filtered.map(opening =>
    calculateRelevanceScore(opening, filtered, timeUsage)
  );

  // Sort by relevance score and take top N
  return withRelevance
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);
}

/**
 * Generate insights from opening data
 */
export function generateInsights(
  topOpenings: OpeningWithRelevance[],
  avgMoveTimeData: AvgMoveTimeByResult[],
  gameLengthBins: GameLengthBin[]
): InsightData[] {
  const insights: InsightData[] = [];

  // Insights from top openings
  topOpenings.forEach(opening => {
    // High loss rate
    if (opening.loss_rate >= 0.5 && opening.games_count >= 5) {
      insights.push({
        type: 'warning',
        message: `You lose ${(opening.loss_rate * 100).toFixed(0)}% of games in ${opening.eco_code}; address this in REPAIR.`,
        opening_eco: opening.eco_code,
        priority: 'high',
      });
    }

    // Strong opening
    if (opening.winrate >= 0.6 && opening.games_count >= 5) {
      insights.push({
        type: 'strength',
        message: `${opening.eco_code} has strong results (${(opening.winrate * 100).toFixed(0)}% winrate); consider moving to CORE.`,
        opening_eco: opening.eco_code,
        priority: 'medium',
      });
    }

    // Early losses
    if (opening.early_loss_count && opening.early_loss_count >= 3) {
      insights.push({
        type: 'warning',
        message: `${opening.eco_code} appears frequently in short losses; practice this line.`,
        opening_eco: opening.eco_code,
        priority: 'high',
      });
    }
  });

  // Insights from move time
  const winsTime = avgMoveTimeData.find(d => d.result === 'Wins')?.avgTime || 0;
  const lossesTime = avgMoveTimeData.find(d => d.result === 'Losses')?.avgTime || 0;
  const timeDiff = lossesTime - winsTime;

  if (timeDiff > 0.5 && lossesTime > 0) {
    insights.push({
      type: 'warning',
      message: `You think significantly slower in losing games (+${timeDiff.toFixed(1)}s). This suggests unfamiliarity in the opening stage.`,
      priority: 'high',
    });
  } else if (timeDiff < -0.5 && winsTime > 0) {
    insights.push({
      type: 'strength',
      message: `You think faster in losing games, suggesting good opening knowledge. Focus on middlegame transitions.`,
      priority: 'medium',
    });
  }

  // Insights from game length
  const earlyBucket = gameLengthBins.find(b => b.bucket === '0-20');
  const lateBuckets = gameLengthBins.filter(b => b.bucket === '41-60' || b.bucket === '60+');

  if (earlyBucket) {
    const earlyTotal = earlyBucket.wins + earlyBucket.draws + earlyBucket.losses;
    const earlyLossRate = earlyTotal > 0 ? earlyBucket.losses / earlyTotal : 0;

    if (earlyLossRate > 0.5 && earlyTotal >= 5) {
      insights.push({
        type: 'warning',
        message: `Most losses occur before move 25. Focus on opening preparation.`,
        priority: 'high',
      });
    }
  }

  const lateTotal = lateBuckets.reduce((sum, b) => sum + b.wins + b.draws + b.losses, 0);
  const lateWins = lateBuckets.reduce((sum, b) => sum + b.wins, 0);
  const lateWinRate = lateTotal > 0 ? lateWins / lateTotal : 0;

  if (lateWinRate > 0.6 && lateTotal >= 5) {
    insights.push({
      type: 'strength',
      message: `Longer games tend to favor you (${(lateWinRate * 100).toFixed(0)}% winrate in 40+ move games).`,
      priority: 'medium',
    });
  }

  // Limit to top 4 insights by priority
  return insights
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 4);
}

/**
 * Extract repertoire classification signals from opening data
 */
export function classifyOpeningSignals(
  opening: OpeningWithRelevance,
  avgMoveTimeData: AvgMoveTimeByResult[],
  gameLengthBins: GameLengthBin[],
  allOpenings: OpeningStats[]
): RepertoireSignals {
  const avgFrequency = allOpenings.reduce((sum, o) => sum + o.frequency, 0) / allOpenings.length;

  // Move time stability
  const winsTime = avgMoveTimeData.find(d => d.result === 'Wins')?.avgTime || 0;
  const lossesTime = avgMoveTimeData.find(d => d.result === 'Losses')?.avgTime || 0;
  const timeDiff = Math.abs(lossesTime - winsTime);

  return {
    eco_code: opening.eco_code,
    opening_name: opening.opening_name,
    color: opening.color,
    // CORE signals
    high_winrate: opening.winrate >= 0.55,
    stable_move_time: timeDiff < 1.0,
    balanced_game_length: true, // Simplified for now
    high_frequency: opening.frequency > avgFrequency * 1.2,
    // REPAIR signals
    high_frequency_low_winrate: opening.frequency > avgFrequency && opening.winrate < 0.45,
    many_early_losses: (opening.early_loss_count || 0) >= 3,
    slow_in_losses: timeDiff > 1.5 && lossesTime > winsTime,
    repeated_poor_results: opening.loss_rate > 0.5,
    // EXPANSION signals
    low_frequency_high_winrate: opening.frequency < avgFrequency * 0.8 && opening.winrate >= 0.55,
    strong_move_time_stability: timeDiff < 0.5,
    performs_well_in_long_games: opening.winrate >= 0.55, // Simplified
    // EXPERIMENTAL signals
    low_frequency_low_winrate: opening.frequency < avgFrequency * 0.8 && opening.winrate < 0.45,
    very_fast_losses: (opening.early_loss_count || 0) >= 2 && opening.games_count < 10,
    slow_unfamiliar: timeDiff > 2.0 && lossesTime > winsTime,
    // DEVELOPING signals
    moderate_frequency: opening.frequency >= avgFrequency * 0.8 && opening.frequency <= avgFrequency * 1.2,
    moderate_winrate: opening.winrate >= 0.45 && opening.winrate < 0.55,
    no_severe_weaknesses: opening.loss_rate < 0.5 && (opening.early_loss_count || 0) < 3,
  };
}

/**
 * Cluster openings by family/name for high-level analysis
 */
export function clusterOpenings(
  openings: OpeningStats[],
  minGames: number = 3
): ClusterStats[] {
  const clusters = new Map<string, ClusterStats>();

  openings.forEach(opening => {
    // Extract cluster name (e.g., "Italian Game" from "Italian Game: Giuoco Piano")
    // Or use ECO group if name is not structured (e.g., "C50")
    let clusterName = opening.opening_name.split(':')[0].trim();

    // Fallback to ECO group if name is too short or generic
    if (clusterName.length < 3) {
      clusterName = opening.eco_code.substring(0, 2) + 'x Series';
    }

    const existing = clusters.get(clusterName);
    if (existing) {
      existing.wins += opening.wins;
      existing.draws += opening.draws;
      existing.losses += opening.losses;
      existing.games += opening.games_count;
    } else {
      clusters.set(clusterName, {
        clusterName,
        wins: opening.wins,
        draws: opening.draws,
        losses: opening.losses,
        games: opening.games_count,
        winrate: 0,
        avgScore: 0,
      });
    }
  });

  // Calculate rates and filter
  return Array.from(clusters.values())
    .filter(c => c.games >= minGames)
    .map(c => ({
      ...c,
      winrate: c.wins / c.games,
      avgScore: (c.wins + c.draws * 0.5) / c.games,
    }))
    .sort((a, b) => b.games - a.games) // Sort by popularity
    .slice(0, 8); // Top 8 clusters
}
