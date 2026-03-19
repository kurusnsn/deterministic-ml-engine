"""
Unit tests for line clustering service.
"""

import pytest
from gateway_modules.services.line_clustering_service import extract_opening_line, cluster_games_by_line
from gateway_modules.services.opening_analyzer import NormalizedGame


class TestLineExtraction:
    """Test cases for opening line extraction."""

    def test_extract_basic_line(self):
        """Test extraction of basic opening line."""
        pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6"
        line = extract_opening_line(pgn, max_plies=8)
        assert len(line) == 8
        assert line[0] == "e4"
        assert line[1] == "e5"

    def test_extract_partial_line(self):
        """Test extraction with fewer moves than max_plies."""
        pgn = "1. e4 e5 2. Nf3"
        line = extract_opening_line(pgn, max_plies=14)
        assert len(line) == 4  # 2 moves = 4 plies

    def test_extract_with_max_plies_limit(self):
        """Test that max_plies limit is respected."""
        pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O"
        line = extract_opening_line(pgn, max_plies=6)
        assert len(line) == 6

    def test_empty_pgn(self):
        """Test handling of empty PGN."""
        line = extract_opening_line("", max_plies=14)
        assert line == []

    def test_invalid_pgn(self):
        """Test handling of invalid PGN."""
        line = extract_opening_line("invalid pgn string", max_plies=14)
        assert line == []

    def test_pgn_with_no_moves(self):
        """Test handling of PGN with no moves."""
        pgn = "[Event \"Test\"]\n[Site \"?\"]\n[Result \"*\"]\n\n*"
        line = extract_opening_line(pgn, max_plies=14)
        assert line == []


class TestLineClustering:
    """Test cases for game clustering by opening lines."""

    def create_test_game(self, game_id: str, pgn: str, eco: str = "B20") -> NormalizedGame:
        """Helper to create a test NormalizedGame."""
        return NormalizedGame(
            id=game_id,
            pgn=pgn,
            opening_eco=eco,
            white=None,
            black=None,
            result="1-0"
        )

    def test_cluster_same_line(self):
        """Test clustering games with same opening line."""
        pgn1 = "1. e4 e5 2. Nf3 Nc6 3. Bb5"
        pgn2 = "1. e4 e5 2. Nf3 Nc6 3. Bb5"
        
        games = [
            self.create_test_game("1", pgn1, "B20"),
            self.create_test_game("2", pgn2, "B20")
        ]
        
        clusters = cluster_games_by_line(games)
        assert len(clusters) == 1  # Should cluster into one line
        assert len(list(clusters.values())[0]) == 2  # Two games in cluster

    def test_cluster_different_lines(self):
        """Test clustering games with different opening lines."""
        pgn1 = "1. e4 e5 2. Nf3 Nc6 3. Bb5"
        pgn2 = "1. d4 d5 2. c4 e6 3. Nc3"
        
        games = [
            self.create_test_game("1", pgn1, "B20"),
            self.create_test_game("2", pgn2, "D40")
        ]
        
        clusters = cluster_games_by_line(games)
        assert len(clusters) == 2  # Should create two clusters

    def test_cluster_with_empty_pgn(self):
        """Test clustering with games that have no PGN."""
        pgn1 = "1. e4 e5 2. Nf3"
        game_without_pgn = self.create_test_game("2", "", "B20")
        game_without_pgn.pgn = None
        
        games = [
            self.create_test_game("1", pgn1, "B20"),
            game_without_pgn
        ]
        
        clusters = cluster_games_by_line(games)
        # Should only cluster the game with PGN
        assert len(clusters) == 1
        assert len(list(clusters.values())[0]) == 1

    def test_cluster_canonical_id(self):
        """Test that canonical line IDs are consistent."""
        pgn1 = "1. e4 e5 2. Nf3 Nc6"
        pgn2 = "1. e4 e5 2. Nf3 Nc6"
        
        games = [
            self.create_test_game("1", pgn1, "B20"),
            self.create_test_game("2", pgn2, "B20")
        ]
        
        clusters = cluster_games_by_line(games)
        # Both games should have same line hash
        assert len(clusters) == 1

    def test_cluster_empty_games_list(self):
        """Test clustering with empty games list."""
        clusters = cluster_games_by_line([])
        assert clusters == {}

    def test_cluster_line_structure(self):
        """Test that clustered games have correct structure."""
        pgn = "1. e4 e5 2. Nf3"
        games = [self.create_test_game("1", pgn, "B20")]
        
        clusters = cluster_games_by_line(games)
        assert len(clusters) == 1
        
        cluster_games = list(clusters.values())[0]
        assert len(cluster_games) == 1
        
        game_data = cluster_games[0]
        assert "game" in game_data
        assert "line" in game_data
        assert "eco" in game_data
        assert isinstance(game_data["line"], list)
        assert len(game_data["line"]) > 0






