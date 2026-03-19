"""
Mock test positions for LLM analysis testing
"""

TEST_POSITIONS = [
    {
        "name": "Opening - 1.e4",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "last_move": "e4",
        "move_history": ["e4"],
        "question": "Analyze the opening move 1.e4"
    },
    {
        "name": "Sicilian Defense",
        "fen": "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
        "last_move": "c5",
        "move_history": ["e4", "c5"],
        "question": "What's the main idea behind the Sicilian Defense?"
    },
    {
        "name": "Italian Game",
        "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
        "last_move": "Bc4",
        "move_history": ["e4", "e5", "Nf3", "Nc6", "Bc4"],
        "question": "Analyze the Italian Game setup"
    },
    {
        "name": "Queen's Gambit",
        "fen": "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2",
        "last_move": "c4",
        "move_history": ["d4", "d5", "c4"],
        "question": "What are White's ideas in the Queen's Gambit?"
    },
    {
        "name": "Middlegame Tactics",
        "fen": "r1bq1rk1/ppp2ppp/2n2n2/3p4/1b1P4/2NBP3/PPQ2PPP/R1B1K2R w KQ - 0 9",
        "last_move": "Bb4",
        "move_history": ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O", "Nxe4", "d4", "Nd6", "Bxc6", "dxc6", "dxe5", "Nf5", "Qxd8+", "Kxd8"],
        "question": "Is there a tactical opportunity here?"
    },
    {
        "name": "Endgame - Rook Endgame",
        "fen": "8/5pk1/6p1/8/3R4/6PP/5PK1/3r4 w - - 0 1",
        "last_move": "Rd1",
        "move_history": [],
        "question": "How should White proceed in this rook endgame?"
    },
    {
        "name": "Fork Tactic",
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        "last_move": "Nf6",
        "move_history": ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
        "question": "Can White create a fork here?"
    }
]

def get_test_position(index=0):
    """Get a test position by index"""
    if 0 <= index < len(TEST_POSITIONS):
        return TEST_POSITIONS[index]
    return TEST_POSITIONS[0]

def get_all_test_positions():
    """Get all test positions"""
    return TEST_POSITIONS
