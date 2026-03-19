from gateway_modules.models.repertoire import RepertoireReport
from gateway_modules.services.playstyle_service import (
    _to_user_perspective_delta,
    _to_user_perspective_eval,
    compute_playstyle_profile,
)


def _build_moves(
    total_moves: int,
    *,
    user_color: str,
    high_vol_moves: int = 0,
    bad_positions: int = 0,
    comebacks: int = 0,
):
    moves = []
    for i in range(total_moves):
        moves.append(
            {
                "ply": i + 1,
                "user_color": user_color,
                "eval_delta": 10,
                "eval": {"cp": 20},
                "heuristics": {},
                "mistake_type": None,
            }
        )

    for i in range(min(high_vol_moves, total_moves)):
        moves[i]["eval_delta"] = 120

    for i in range(min(bad_positions, total_moves)):
        moves[i]["eval"]["cp"] = -150 if user_color == "white" else 150
        moves[i]["eval_delta"] = 20

    for i in range(min(comebacks, bad_positions, total_moves)):
        moves[i]["eval_delta"] = 80 if user_color == "white" else -80

    return moves


def _make_report(moves):
    return RepertoireReport(
        user_id="test-user",
        total_games=max(1, len(moves) // 5),
        white_games=max(1, len([m for m in moves if m.get("user_color") == "white"])),
        black_games=max(1, len([m for m in moves if m.get("user_color") == "black"])),
        overall_winrate=0.5,
        engine_analysis={"moves": moves},
    )


def test_user_perspective_helpers_for_black():
    assert _to_user_perspective_eval(180, "black") == -180
    assert _to_user_perspective_eval(-120, "black") == 120
    assert _to_user_perspective_delta(-70, "black") == 70
    assert _to_user_perspective_delta(45, "black") == -45


def test_aggressive_defensive_is_not_binary_for_small_changes():
    report_short = _make_report(
        _build_moves(
            50,
            user_color="white",
            high_vol_moves=0,
            bad_positions=0,
            comebacks=0,
        )
    )
    report_mid = _make_report(
        _build_moves(
            100,
            user_color="white",
            high_vol_moves=2,
            bad_positions=3,
            comebacks=0,
        )
    )

    short_profile = compute_playstyle_profile(report_short)
    mid_profile = compute_playstyle_profile(report_mid)

    assert 0.0 < short_profile.overall.aggressive < 1.0
    assert 0.0 < mid_profile.overall.aggressive < 1.0
    assert 0.0 < mid_profile.overall.defensive < 1.0
    assert abs(short_profile.overall.aggressive - mid_profile.overall.aggressive) < 0.5


def test_black_comebacks_count_from_user_perspective():
    moves = [
        {
            "ply": 2,
            "user_color": "black",
            "eval_delta": -120,  # Improves for black
            "eval": {"cp": 250},  # Bad for black if interpreted correctly
            "heuristics": {},
            "mistake_type": None,
        },
        {
            "ply": 4,
            "user_color": "black",
            "eval_delta": -60,  # Improves for black
            "eval": {"cp": 180},
            "heuristics": {},
            "mistake_type": None,
        },
        {
            "ply": 6,
            "user_color": "black",
            "eval_delta": 20,  # Slightly worse for black
            "eval": {"cp": 220},
            "heuristics": {},
            "mistake_type": None,
        },
        {
            "ply": 8,
            "user_color": "black",
            "eval_delta": -70,  # Improves for black
            "eval": {"cp": 160},
            "heuristics": {},
            "mistake_type": None,
        },
    ]

    report = _make_report(moves)
    profile = compute_playstyle_profile(report)

    assert profile.overall.defensive > profile.overall.aggressive
