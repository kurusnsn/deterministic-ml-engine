import unittest

from app.services.parser import normalize_lichess, normalize_chesscom


class TestParserNormalization(unittest.TestCase):
    def test_normalize_lichess_basic(self):
        raw = {
            "id": "abc123",
            "url": "https://lichess.org/abc123",
            "rated": True,
            "speed": "blitz",
            "clock": {"initial": 300, "increment": 0},
            "createdAt": 1700000000000,
            "lastMoveAt": 1700000300000,
            "status": "mate",
            "winner": "white",
            "players": {
                "white": {"user": {"name": "Alice"}, "rating": 2100},
                "black": {"user": {"name": "Bob"}, "rating": 2000},
            },
            "opening": {"name": "Sicilian Defense", "eco": "B20"},
            "pgn": """[Event "?"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3""",
        }

        game = normalize_lichess(raw)

        self.assertEqual(game["source"], "lichess.org")
        self.assertEqual(game["id"], "abc123")
        self.assertEqual(game["site"], "lichess.org")
        self.assertEqual(game["perf"], "blitz")
        self.assertEqual(game["time_control"], "300+0")
        self.assertEqual(game["start_time"], 1700000000000)
        self.assertEqual(game["end_time"], 1700000300000)
        self.assertEqual(game["result"], "1-0")
        self.assertEqual(game["termination"], "mate")
        self.assertEqual(game["opening_name"], "Sicilian Defense")
        self.assertEqual(game["opening_eco"], "B20")
        self.assertEqual(game["white"]["username"], "Alice")
        self.assertEqual(game["white"]["rating"], 2100)
        self.assertEqual(game["white"]["result"], "win")
        self.assertEqual(game["black"]["username"], "Bob")
        self.assertEqual(game["black"]["rating"], 2000)

    def test_normalize_chesscom_with_pgn(self):
        raw = {
            "url": "https://www.chess.com/game/live/151139296381",
            "rated": True,
            "time_class": "blitz",
            "time_control": "300+0",
            "start_time": 1756825865,  # seconds
            "end_time": 1756826369,    # seconds
            "white": {"username": "Hikaru", "rating": 3401, "result": "win"},
            "black": {"username": "Aygehovit1992", "rating": 2820, "result": "resigned"},
            "pgn": (
                "[Event \"Live Chess\"]\n"
                "[Site \"Chess.com\"]\n"
                "[Date \"2024.09.01\"]\n"
                "[TimeControl \"300+0\"]\n"
                "[Result \"1-0\"]\n"
                "[ECO \"A48\"]\n"
                "[Opening \"Indian Game: Knight’s Variation, East Indian Defense\"]\n"
                "[Termination \"resigned\"]\n\n"
                "1. d4 Nf6 2. Nf3\n"
            ),
        }

        game = normalize_chesscom(raw)

        self.assertEqual(game["source"], "chess.com")
        self.assertEqual(game["id"], "151139296381")
        self.assertEqual(game["site"], "chess.com")
        self.assertEqual(game["perf"], "blitz")
        self.assertEqual(game["time_control"], "300+0")
        self.assertEqual(game["start_time"], 1756825865 * 1000)
        self.assertEqual(game["end_time"], 1756826369 * 1000)
        self.assertEqual(game["result"], "1-0")
        self.assertEqual(game["termination"], "resigned")
        self.assertEqual(game["opening_name"], "Indian Game: Knight’s Variation, East Indian Defense")
        self.assertEqual(game["opening_eco"], "A48")
        self.assertEqual(game["white"]["username"], "Hikaru")
        self.assertEqual(game["white"]["result"], "win")
        self.assertEqual(game["black"]["username"], "Aygehovit1992")
        self.assertEqual(game["black"]["result"], "resigned")


if __name__ == "__main__":
    unittest.main()

