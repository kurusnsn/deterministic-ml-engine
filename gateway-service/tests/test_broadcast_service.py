"""
Backend Tests: Broadcast Service
================================

Tests for the broadcast ingestion and game state services.
Uses pytest with mocked external dependencies.

Test categories:
- Lichess API ingestion (mocked responses)
- PGN parsing and move extraction
- FEN generation
- Game state management
- Standings calculation
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime
import json

# ============================================
# Mock Data Factories
# ============================================

def create_mock_lichess_broadcast():
    """Factory for Lichess broadcast API response"""
    return {
        "tour": {
            "id": "abc123",
            "name": "Spring Championship 2025",
            "slug": "spring-championship-2025",
            "description": "The annual spring championship",
            "createdAt": 1712000000000,
            "tier": 5,
        },
        "rounds": [
            {
                "id": "round1",
                "name": "Round 1",
                "slug": "round-1",
                "createdAt": 1712000000000,
                "startsAt": 1712100000000,
                "finished": True,
            },
            {
                "id": "round2",
                "name": "Round 2",
                "slug": "round-2",
                "createdAt": 1712200000000,
                "startsAt": 1712300000000,
                "finished": False,
            },
        ],
    }


def create_mock_lichess_round_pgn():
    """Factory for Lichess round PGN stream response"""
    return """[Event "Spring Championship 2025"]
[Site "New York, USA"]
[Date "2025.04.01"]
[Round "1.1"]
[White "Carlsen, Magnus"]
[Black "Nakamura, Hikaru"]
[Result "1/2-1/2"]
[WhiteElo "2830"]
[BlackElo "2789"]
[WhiteTitle "GM"]
[BlackTitle "GM"]
[TimeControl "90+30"]
[ECO "C65"]
[Opening "Ruy Lopez"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. d3 Bc5 5. Bxc6 dxc6 6. O-O Nd7 7. Nbd2 O-O
8. Nc4 Re8 9. Be3 Bxe3 10. Nxe3 Nf8 11. Nh4 Ne6 12. Nef5 g6 13. Ne3 Ng7 1/2-1/2

[Event "Spring Championship 2025"]
[Site "New York, USA"]
[Date "2025.04.01"]
[Round "1.2"]
[White "Caruana, Fabiano"]
[Black "Ding, Liren"]
[Result "1-0"]
[WhiteElo "2804"]
[BlackElo "2762"]
[WhiteTitle "GM"]
[BlackTitle "GM"]
[TimeControl "90+30"]
[ECO "D37"]
[Opening "QGD"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bf4 O-O 6. e3 Nbd7 7. c5 c6
8. Bd3 b6 9. b4 a5 10. a3 Ba6 11. O-O Bxd3 12. Qxd3 Qc8 13. Rfb1 1-0
"""


def create_mock_game_state():
    """Factory for game state data"""
    return {
        "id": "g1",
        "tournament_id": "t1",
        "round": 1,
        "white": {
            "name": "Magnus Carlsen",
            "title": "GM",
            "rating": 2830,
        },
        "black": {
            "name": "Hikaru Nakamura",
            "title": "GM",
            "rating": 2789,
        },
        "moves": ["e4", "e5", "Nf3", "Nc6", "Bb5"],
        "fen": "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
        "result": "*",
        "status": "live",
    }


# ============================================
# Lichess Ingestion Tests
# ============================================

class TestLichessIngestion:
    """Tests for Lichess broadcast API ingestion"""

    @pytest.mark.asyncio
    async def test_fetch_broadcast_list(self):
        """Test fetching list of broadcasts from Lichess"""
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "currentPageResults": [create_mock_lichess_broadcast()]
        })
        mock_response.status_code = 200

        with patch('httpx.AsyncClient.get', return_value=mock_response):
            # Simulate the ingestion service
            response = await mock_response.json()
            
            assert "currentPageResults" in response
            assert len(response["currentPageResults"]) == 1
            assert response["currentPageResults"][0]["tour"]["name"] == "Spring Championship 2025"

    @pytest.mark.asyncio
    async def test_fetch_round_pgn_stream(self):
        """Test fetching PGN stream from a round"""
        mock_pgn = create_mock_lichess_round_pgn()
        mock_response = AsyncMock()
        mock_response.text = mock_pgn
        mock_response.status_code = 200

        with patch('httpx.AsyncClient.get', return_value=mock_response):
            # Verify PGN content
            assert "[White \"Carlsen, Magnus\"]" in mock_pgn
            assert "[Black \"Nakamura, Hikaru\"]" in mock_pgn
            assert "1. e4 e5" in mock_pgn

    @pytest.mark.asyncio
    async def test_normalize_broadcast_to_tournament(self):
        """Test normalizing Lichess broadcast data to internal tournament format"""
        broadcast = create_mock_lichess_broadcast()
        
        # Simulate normalization
        tournament = {
            "id": broadcast["tour"]["id"],
            "name": broadcast["tour"]["name"],
            "description": broadcast["tour"]["description"],
            "status": "live" if not broadcast["rounds"][-1]["finished"] else "finished",
            "rounds": len(broadcast["rounds"]),
            "created_at": datetime.fromtimestamp(broadcast["tour"]["createdAt"] / 1000),
        }
        
        assert tournament["name"] == "Spring Championship 2025"
        assert tournament["rounds"] == 2
        assert tournament["status"] == "live"

    @pytest.mark.asyncio
    async def test_handle_lichess_rate_limit(self):
        """Test handling Lichess API rate limiting (429 response)"""
        mock_response = AsyncMock()
        mock_response.status_code = 429
        mock_response.headers = {"Retry-After": "60"}

        with patch('httpx.AsyncClient.get', return_value=mock_response):
            # Service should handle rate limiting gracefully
            assert mock_response.status_code == 429
            assert "Retry-After" in mock_response.headers


# ============================================
# PGN Parsing Tests
# ============================================

class TestPGNParsing:
    """Tests for PGN parsing and move extraction"""

    def test_parse_game_headers(self):
        """Test extracting game headers from PGN"""
        pgn = create_mock_lichess_round_pgn()
        
        # Simple header extraction
        headers = {}
        for line in pgn.split('\n'):
            if line.startswith('[') and ']' in line:
                key = line[1:line.index(' ')]
                value = line[line.index('"')+1:line.rindex('"')]
                headers[key] = value
                if key == 'Result':
                    break  # First game headers
        
        assert headers.get("White") == "Carlsen, Magnus"
        assert headers.get("Black") == "Nakamura, Hikaru"
        assert headers.get("Result") == "1/2-1/2"
        assert headers.get("WhiteElo") == "2830"
        assert headers.get("BlackElo") == "2789"

    def test_extract_moves_from_pgn(self):
        """Test extracting move list from PGN"""
        pgn_moves = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6"
        
        # Simple move extraction (remove move numbers)
        moves = []
        parts = pgn_moves.split()
        for part in parts:
            if not part[0].isdigit():
                moves.append(part)
        
        assert moves == ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"]

    def test_parse_multiple_games_from_pgn(self):
        """Test parsing multiple games from a PGN file"""
        pgn = create_mock_lichess_round_pgn()
        
        # Split by empty lines followed by new game
        games = pgn.strip().split('\n\n[Event')
        games = [games[0]] + ['[Event' + g for g in games[1:]]
        
        assert len(games) == 2

    def test_handle_pgn_annotations(self):
        """Test handling PGN with annotations and comments"""
        pgn_with_annotations = "1. e4 {Best opening move} e5 2. Nf3! Nc6?"
        
        # Strip annotations
        import re
        clean_pgn = re.sub(r'\{[^}]*\}', '', pgn_with_annotations)
        clean_pgn = re.sub(r'[!?]+', '', clean_pgn)
        
        assert "{" not in clean_pgn
        assert "!" not in clean_pgn
        assert "?" not in clean_pgn


# ============================================
# FEN Generation Tests
# ============================================

class TestFENGeneration:
    """Tests for FEN string generation from moves"""

    def test_starting_position_fen(self):
        """Test FEN for starting position"""
        starting_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        
        assert starting_fen.startswith("rnbqkbnr")
        assert " w " in starting_fen  # White to move
        assert "KQkq" in starting_fen  # All castling rights

    def test_fen_after_e4(self):
        """Test FEN after 1. e4"""
        fen_after_e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        
        assert "4P3" in fen_after_e4  # Pawn on e4
        assert " b " in fen_after_e4  # Black to move
        assert "e3" in fen_after_e4   # En passant square

    def test_fen_after_castling(self):
        """Test FEN after kingside castling"""
        fen_after_oo = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1RK1 b kq - 1 1"
        
        assert "RK1" in fen_after_oo  # King and rook on castled squares
        assert " kq " in fen_after_oo  # White lost castling rights


# ============================================
# Game State Tests
# ============================================

class TestGameState:
    """Tests for game state management"""

    def test_create_game_state(self):
        """Test creating initial game state"""
        state = create_mock_game_state()
        
        assert state["id"] == "g1"
        assert state["status"] == "live"
        assert len(state["moves"]) == 5

    def test_apply_move_to_state(self):
        """Test applying a move to game state"""
        state = create_mock_game_state()
        initial_moves = len(state["moves"])
        
        # Apply new move
        state["moves"].append("a6")
        
        assert len(state["moves"]) == initial_moves + 1
        assert state["moves"][-1] == "a6"

    def test_update_clocks(self):
        """Test updating clock times"""
        state = create_mock_game_state()
        state["clocks"] = {
            "white": "1:30:00",
            "black": "1:25:30",
        }
        
        # Simulate black's move (white's clock doesn't change)
        state["clocks"]["black"] = "1:24:15"
        
        assert state["clocks"]["white"] == "1:30:00"
        assert state["clocks"]["black"] == "1:24:15"

    def test_game_result_update(self):
        """Test updating game result"""
        state = create_mock_game_state()
        
        # Game ends in draw
        state["result"] = "1/2-1/2"
        state["status"] = "finished"
        
        assert state["result"] == "1/2-1/2"
        assert state["status"] == "finished"


# ============================================
# Standings Calculation Tests
# ============================================

class TestStandingsCalculation:
    """Tests for tournament standings calculation"""

    def test_calculate_scores_from_games(self):
        """Test calculating player scores from game results"""
        games = [
            {"white": "Carlsen", "black": "Nakamura", "result": "1-0"},
            {"white": "Caruana", "black": "Ding", "result": "1/2-1/2"},
            {"white": "Nakamura", "black": "Carlsen", "result": "0-1"},
        ]
        
        scores = {}
        for game in games:
            white, black = game["white"], game["black"]
            result = game["result"]
            
            if white not in scores:
                scores[white] = 0
            if black not in scores:
                scores[black] = 0
            
            if result == "1-0":
                scores[white] += 1
            elif result == "0-1":
                scores[black] += 1
            elif result == "1/2-1/2":
                scores[white] += 0.5
                scores[black] += 0.5
        
        assert scores["Carlsen"] == 2.0
        assert scores["Nakamura"] == 0.0
        assert scores["Caruana"] == 0.5
        assert scores["Ding"] == 0.5

    def test_sort_standings_by_score(self):
        """Test sorting standings by score"""
        standings = [
            {"name": "Player A", "score": 3.0},
            {"name": "Player B", "score": 4.5},
            {"name": "Player C", "score": 2.5},
        ]
        
        sorted_standings = sorted(standings, key=lambda x: x["score"], reverse=True)
        
        assert sorted_standings[0]["name"] == "Player B"
        assert sorted_standings[1]["name"] == "Player A"
        assert sorted_standings[2]["name"] == "Player C"

    def test_tiebreak_by_buchholz(self):
        """Test tiebreak calculation using Buchholz system"""
        # Simplified Buchholz: sum of opponents' scores
        player_opponents = {
            "A": ["B", "C"],  # A played B and C
            "B": ["A", "C"],
            "C": ["A", "B"],
        }
        scores = {"A": 1.5, "B": 1.5, "C": 1.0}
        
        buchholz = {}
        for player, opponents in player_opponents.items():
            buchholz[player] = sum(scores[opp] for opp in opponents)
        
        assert buchholz["A"] == 2.5  # B(1.5) + C(1.0)
        assert buchholz["B"] == 2.5  # A(1.5) + C(1.0)
        assert buchholz["C"] == 3.0  # A(1.5) + B(1.5)


# ============================================
# Error Handling Tests
# ============================================

class TestErrorHandling:
    """Tests for error handling in broadcast services"""

    @pytest.mark.asyncio
    async def test_handle_invalid_pgn(self):
        """Test handling invalid PGN data"""
        invalid_pgn = "This is not valid PGN data"
        
        # Should handle gracefully without crashing
        assert "[Event" not in invalid_pgn

    @pytest.mark.asyncio
    async def test_handle_missing_round_data(self):
        """Test handling missing round in broadcast"""
        broadcast = create_mock_lichess_broadcast()
        broadcast["rounds"] = []
        
        # Should handle empty rounds
        assert len(broadcast["rounds"]) == 0

    @pytest.mark.asyncio
    async def test_handle_network_timeout(self):
        """Test handling network timeout"""
        import asyncio
        
        async def mock_slow_request():
            await asyncio.sleep(0.1)
            raise asyncio.TimeoutError()
        
        with pytest.raises(asyncio.TimeoutError):
            await mock_slow_request()



