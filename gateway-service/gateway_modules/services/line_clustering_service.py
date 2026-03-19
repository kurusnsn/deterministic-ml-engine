"""
Line clustering service for grouping games by opening lines.
"""

import hashlib
import chess.pgn
from io import StringIO
from typing import List, Dict, Any, Optional
from .opening_analyzer import NormalizedGame


def extract_opening_line(pgn: str, max_plies: int = 14) -> List[str]:
    """
    Extract opening line from PGN string.

    Args:
        pgn: PGN string of the game
        max_plies: Maximum number of plies to extract (default 14)

    Returns:
        List of SAN moves representing the opening line
        Returns empty list if PGN is invalid or has no moves
    """
    if not pgn:
        return []

    try:
        pgn_io = StringIO(pgn)
        game = chess.pgn.read_game(pgn_io)
        
        if game is None:
            return []

        moves = []
        node = game
        ply_count = 0

        while node and ply_count < max_plies:
            node = node.variation(0) if node.variations else None
            if node and node.move:
                moves.append(node.san())
                ply_count += 1

        return moves
    except Exception as e:
        # Log error but return empty list
        print(f"Error parsing PGN: {e}")
        return []


def cluster_games_by_line(games: List[NormalizedGame]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Cluster games by their opening lines.

    Args:
        games: List of NormalizedGame objects

    Returns:
        Dictionary mapping line hash to list of game dictionaries
        Each game dict contains: {"game": NormalizedGame, "line": List[str], "eco": Optional[str]}
    """
    clusters: Dict[str, List[Dict[str, Any]]] = {}

    for game in games:
        if not game.pgn:
            continue

        try:
            # Extract opening line
            line = extract_opening_line(game.pgn, max_plies=14)
            
            if not line:
                continue

            # Create canonical line representation (normalize move order)
            canonical_line = _normalize_line(line)
            
            # Generate hash for clustering
            line_hash = hashlib.md5("|".join(canonical_line).encode()).hexdigest()[:8]

            # Add to cluster
            if line_hash not in clusters:
                clusters[line_hash] = []

            clusters[line_hash].append({
                "game": game,
                "line": line,
                "eco": game.opening_eco
            })
        except Exception as e:
            # Skip games with errors
            print(f"Error clustering game {game.id}: {e}")
            continue

    return clusters


def _normalize_line(line: List[str]) -> List[str]:
    """
    Normalize a line for comparison (handle transpositions, etc.).

    Args:
        line: List of SAN moves

    Returns:
        Normalized line (currently just returns as-is, can be enhanced)
    """
    # For now, just return the line as-is
    # Future enhancement: handle transpositions, move order normalization
    return line






