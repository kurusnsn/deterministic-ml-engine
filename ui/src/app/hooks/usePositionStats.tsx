import { useMemo } from 'react';
import { MoveStat } from './useOpeningGraph';
import { getPerformanceDetails } from '../../lib/openingMetrics';

export type GameResult = {
  white?: string;
  black?: string;
  result?: string;
  date?: string;
  plies?: number;
  end_time?: number;
  pgn?: string;
  whiteRating?: number;
  blackRating?: number;
};

export type PositionStats = {
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  winPercentage: number;
  performanceRating?: number;
  averageOpponentElo?: number;
  bestWin?: GameResult & { opponentRating?: number };
  worstLoss?: GameResult & { opponentRating?: number };
  longestGame?: GameResult;
  shortestGame?: GameResult;
  lastPlayed?: GameResult;
  resultsSummary: string;
  scoreLabel: string;
};

export function usePositionStats(
  currentFen: string,
  moves: MoveStat[],
  results: GameResult[],
  playerColor: 'white' | 'black' = 'white',
  username?: string
): PositionStats {
  return useMemo(() => {
    // Filter results for games where the specified player was involved
    const playerGames = username 
      ? results.filter(r => {
          const playerName = playerColor === 'white' ? r.white : r.black;
          return playerName?.toLowerCase() === username.toLowerCase();
        })
      : results;

    const totalGames = playerGames.length;
    
    if (totalGames === 0) {
      return {
        totalGames: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winPercentage: 0,
        resultsSummary: '0-0=0',
        scoreLabel: '0% for ' + playerColor,
      };
    }

    // Count wins/losses/draws from the player's perspective
    let wins = 0, draws = 0, losses = 0;
    let totalOpponentElo = 0;
    let opponentEloCount = 0;
    
    const gameDetails: (GameResult & { opponentRating?: number; playerResult?: string })[] = [];

    playerGames.forEach(game => {
      const result = game.result?.trim();
      let playerResult = '';
      let opponentRating: number | undefined;

      if (playerColor === 'white') {
        if (result === '1-0') { wins++; playerResult = 'win'; }
        else if (result === '0-1') { losses++; playerResult = 'loss'; }
        else if (result === '1/2-1/2') { draws++; playerResult = 'draw'; }
        
        // Get black's rating as opponent
        opponentRating = game.blackRating || (game as any)?.black?.rating;
      } else {
        if (result === '0-1') { wins++; playerResult = 'win'; }
        else if (result === '1-0') { losses++; playerResult = 'loss'; }
        else if (result === '1/2-1/2') { draws++; playerResult = 'draw'; }
        
        // Get white's rating as opponent
        opponentRating = game.whiteRating || (game as any)?.white?.rating;
      }

      if (typeof opponentRating === 'number' && !isNaN(opponentRating)) {
        totalOpponentElo += opponentRating;
        opponentEloCount++;
      }

      // Calculate plies from PGN if not available
      let plies = game.plies;
      if (!plies && game.pgn) {
        try {
          const moves = game.pgn.split(/\d+\./).filter(m => m.trim()).join(' ').split(/\s+/).filter(m => m && !m.includes('{')); 
          plies = moves.length;
        } catch (e) {
          // If PGN parsing fails, leave plies undefined
        }
      }

      // Handle date - could be from date field or end_time timestamp
      let gameDate = game.date;
      if (!gameDate && game.end_time) {
        gameDate = new Date(game.end_time).toISOString().split('T')[0];
      }

      gameDetails.push({
        ...game,
        opponentRating,
        playerResult,
        plies,
        date: gameDate
      });
    });

    const averageOpponentElo = opponentEloCount > 0 ? Math.round(totalOpponentElo / opponentEloCount) : undefined;
    const winPercentage = (wins / totalGames) * 100;

    // Calculate performance rating
    const performanceData = getPerformanceDetails(
      totalOpponentElo,
      averageOpponentElo,
      wins,
      draws,
      losses,
      playerColor
    );

    // Find best win (against highest rated opponent)
    const winGames = gameDetails.filter(g => g.playerResult === 'win');
    const bestWin = winGames.length > 0 
      ? winGames.reduce((best, game) => {
          const bestRating = best.opponentRating || 0;
          const currentRating = game.opponentRating || 0;
          return currentRating > bestRating ? game : best;
        })
      : undefined;

    // Find worst loss (against lowest rated opponent)
    const lossGames = gameDetails.filter(g => g.playerResult === 'loss');
    const worstLoss = lossGames.length > 0
      ? lossGames.reduce((worst, game) => {
          const worstRating = worst.opponentRating || Infinity;
          const currentRating = game.opponentRating || Infinity;
          return currentRating < worstRating ? game : worst;
        })
      : undefined;

    // Find longest and shortest games (by plies if available)
    const gamesWithPlies = gameDetails.filter(g => typeof g.plies === 'number');
    const longestGame = gamesWithPlies.length > 0
      ? gamesWithPlies.reduce((longest, game) => 
          (game.plies || 0) > (longest.plies || 0) ? game : longest
        )
      : undefined;

    const shortestGame = gamesWithPlies.length > 0
      ? gamesWithPlies.reduce((shortest, game) => 
          (game.plies || Infinity) < (shortest.plies || Infinity) ? game : shortest
        )
      : undefined;

    // Find last played game (most recent date if available)
    const gamesWithDates = gameDetails.filter(g => g.date);
    const lastPlayed = gamesWithDates.length > 0
      ? gamesWithDates.reduce((latest, game) => {
          const latestDate = new Date(latest.date || 0);
          const currentDate = new Date(game.date || 0);
          return currentDate > latestDate ? game : latest;
        })
      : undefined;

    return {
      totalGames,
      wins,
      draws,
      losses,
      winPercentage,
      performanceRating: performanceData.performanceRating,
      averageOpponentElo,
      bestWin,
      worstLoss,
      longestGame,
      shortestGame,
      lastPlayed,
      resultsSummary: performanceData.results,
      scoreLabel: performanceData.scoreLabel,
    };
  }, [currentFen, moves, results, playerColor, username]);
}