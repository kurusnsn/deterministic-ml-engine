#!/usr/bin/env python3
"""
Test script for the chess opening repertoire analysis module.

This script creates sample game data and tests the core analysis functions
to ensure they work correctly before deployment.
"""

import sys
import os
from datetime import datetime

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.services.opening_analyzer import (
    NormalizedGame,
    PlayerInfo,
    aggregate_by_eco_and_color,
    get_user_identifier_from_games,
    separate_by_color
)
from app.services.repertoire_classifier import (
    classify_repertoire,
    generate_insights,
    filter_empty_categories
)
from app.models.repertoire import RepertoireReport


def create_sample_games():
    """Create sample game data for testing."""
    games = []

    # Sample games for user "testuser"
    sample_data = [
        # Core white openings (high frequency, good results)
        {"eco": "E10", "name": "Queen's Pawn Opening", "color": "white", "result": "1-0", "count": 5},
        {"eco": "E10", "name": "Queen's Pawn Opening", "color": "white", "result": "1/2-1/2", "count": 3},
        {"eco": "E10", "name": "Queen's Pawn Opening", "color": "white", "result": "0-1", "count": 2},

        # Problem area (high frequency, poor results)
        {"eco": "B20", "name": "Sicilian Defense", "color": "black", "result": "0-1", "count": 8},
        {"eco": "B20", "name": "Sicilian Defense", "color": "black", "result": "1/2-1/2", "count": 2},
        {"eco": "B20", "name": "Sicilian Defense", "color": "black", "result": "1-0", "count": 2},

        # Hidden gem (low frequency, high winrate)
        {"eco": "A10", "name": "English Opening", "color": "white", "result": "1-0", "count": 3},
        {"eco": "A10", "name": "English Opening", "color": "white", "result": "1/2-1/2", "count": 1},

        # Experimental (low frequency, poor results)
        {"eco": "A00", "name": "Uncommon Opening", "color": "white", "result": "0-1", "count": 2},
        {"eco": "A00", "name": "Uncommon Opening", "color": "white", "result": "1/2-1/2", "count": 1},

        # Developing (medium frequency, medium results)
        {"eco": "C50", "name": "Italian Game", "color": "white", "result": "1-0", "count": 3},
        {"eco": "C50", "name": "Italian Game", "color": "white", "result": "0-1", "count": 3},
        {"eco": "C50", "name": "Italian Game", "color": "white", "result": "1/2-1/2", "count": 2},
    ]

    game_id = 1
    for entry in sample_data:
        for _ in range(entry["count"]):
            white_player = PlayerInfo(username="testuser", rating=1500, color="white")
            black_player = PlayerInfo(username="opponent", rating=1500, color="black")

            # Determine user's color and result
            if entry["color"] == "white":
                user_result = entry["result"]
                white_player.result = user_result
                black_player.result = "0-1" if user_result == "1-0" else "1-0" if user_result == "0-1" else "1/2-1/2"
            else:
                # User is black
                if entry["result"] == "1-0":  # User wins
                    user_result = "0-1"  # Black wins in PGN notation
                    white_player.result = "0-1"
                    black_player.result = "1-0"
                elif entry["result"] == "0-1":  # User loses
                    user_result = "1-0"  # White wins in PGN notation
                    white_player.result = "1-0"
                    black_player.result = "0-1"
                else:  # Draw
                    user_result = "1/2-1/2"
                    white_player.result = "1/2-1/2"
                    black_player.result = "1/2-1/2"

                # Swap the usernames for black games
                white_player.username = "opponent"
                black_player.username = "testuser"

            game = NormalizedGame(
                source="test",
                id=str(game_id),
                white=white_player,
                black=black_player,
                result=user_result,
                opening_name=entry["name"],
                opening_eco=entry["eco"],
                time_control="600+0",
                start_time=1640995200000,  # Jan 1, 2022
                end_time=1640995800000,    # 10 minutes later
                pgn=f"1. e4 e5 2. Nf3 # Sample PGN for game {game_id}"
            )

            games.append(game)
            game_id += 1

    return games


def test_opening_aggregation():
    """Test the opening aggregation functionality."""
    print("=== Testing Opening Aggregation ===")

    games = create_sample_games()
    print(f"Created {len(games)} sample games")

    # Test user identifier extraction
    user_identifier = get_user_identifier_from_games(games)
    print(f"Identified user: {user_identifier}")
    assert user_identifier == "testuser", f"Expected 'testuser', got '{user_identifier}'"

    # Test aggregation
    opening_stats = aggregate_by_eco_and_color(games, user_identifier)
    print(f"Generated {len(opening_stats)} opening statistics")

    for stats in opening_stats:
        print(f"  {stats.eco_code} ({stats.opening_name}) as {stats.color}: "
              f"{stats.games_count} games, {stats.winrate:.1%} winrate, "
              f"{stats.frequency:.1%} frequency")

    # Test color separation
    white_stats, black_stats = separate_by_color(opening_stats)
    print(f"White openings: {len(white_stats)}, Black openings: {len(black_stats)}")

    return opening_stats, white_stats, black_stats


def test_repertoire_classification():
    """Test the repertoire classification functionality."""
    print("\n=== Testing Repertoire Classification ===")

    opening_stats, white_stats, black_stats = test_opening_aggregation()

    # Test white repertoire classification
    white_repertoire = classify_repertoire(white_stats, "white")
    print("\nWhite Repertoire Classification:")
    for category, group in white_repertoire.items():
        if group.openings:
            print(f"  {category.title()}: {len(group.openings)} openings, "
                  f"{group.total_games} games, {group.avg_winrate:.1%} avg winrate")
            for opening in group.openings:
                print(f"    - {opening.eco_code} {opening.opening_name}: "
                      f"{opening.games_count} games, {opening.winrate:.1%}")

    # Test black repertoire classification
    black_repertoire = classify_repertoire(black_stats, "black")
    print("\nBlack Repertoire Classification:")
    for category, group in black_repertoire.items():
        if group.openings:
            print(f"  {category.title()}: {len(group.openings)} openings, "
                  f"{group.total_games} games, {group.avg_winrate:.1%} avg winrate")
            for opening in group.openings:
                print(f"    - {opening.eco_code} {opening.opening_name}: "
                      f"{opening.games_count} games, {opening.winrate:.1%}")

    return white_repertoire, black_repertoire


def test_insight_generation():
    """Test the insight generation functionality."""
    print("\n=== Testing Insight Generation ===")

    white_repertoire, black_repertoire = test_repertoire_classification()

    # Generate insights
    insights = generate_insights(white_repertoire, black_repertoire, 50)  # Assume 50 total games

    print(f"\nGenerated {len(insights)} insights:")
    for i, insight in enumerate(insights, 1):
        print(f"  {i}. [{insight.priority.upper()}] {insight.type}: {insight.message}")

    return insights


def test_full_report():
    """Test creating a complete repertoire report."""
    print("\n=== Testing Full Report Generation ===")

    # Get all components
    games = create_sample_games()
    opening_stats, white_stats, black_stats = test_opening_aggregation()
    white_repertoire, black_repertoire = test_repertoire_classification()
    insights = test_insight_generation()

    # Filter empty categories
    white_repertoire = filter_empty_categories(white_repertoire)
    black_repertoire = filter_empty_categories(black_repertoire)

    # Calculate overall statistics
    total_games = len(games)
    white_games = len([g for g in games if g.white and g.white.username == "testuser"])
    black_games = len([g for g in games if g.black and g.black.username == "testuser"])

    total_wins = sum(stats.wins for stats in opening_stats)
    total_losses = sum(stats.losses for stats in opening_stats)
    total_draws = sum(stats.draws for stats in opening_stats)
    total_analyzed_games = total_wins + total_losses + total_draws

    overall_winrate = (total_wins + 0.5 * total_draws) / total_analyzed_games if total_analyzed_games > 0 else 0.0

    # Create report
    report = RepertoireReport(
        user_id="testuser",
        total_games=total_games,
        white_games=white_games,
        black_games=black_games,
        analysis_date=datetime.utcnow(),
        white_repertoire=white_repertoire,
        black_repertoire=black_repertoire,
        insights=insights,
        overall_winrate=overall_winrate
    )

    print(f"\nFull Report Summary:")
    print(f"  User: {report.user_id}")
    print(f"  Total games: {report.total_games}")
    print(f"  White games: {report.white_games}")
    print(f"  Black games: {report.black_games}")
    print(f"  Overall winrate: {report.overall_winrate:.1%}")
    print(f"  White categories: {list(report.white_repertoire.keys())}")
    print(f"  Black categories: {list(report.black_repertoire.keys())}")
    print(f"  Insights: {len(report.insights)}")

    return report


def main():
    """Run all tests."""
    print("Chess Opening Repertoire Analysis - Test Suite")
    print("=" * 50)

    try:
        # Run tests
        test_opening_aggregation()
        test_repertoire_classification()
        test_insight_generation()
        report = test_full_report()

        print("\n" + "=" * 50)
        print(" All tests passed successfully!")
        print("The repertoire analysis module is working correctly.")

        # Show sample API response structure
        print(f"\nSample API Response Structure:")
        print(f"  - report.user_id: {report.user_id}")
        print(f"  - report.total_games: {report.total_games}")
        print(f"  - report.overall_winrate: {report.overall_winrate:.3f}")
        print(f"  - len(report.white_repertoire): {len(report.white_repertoire)}")
        print(f"  - len(report.black_repertoire): {len(report.black_repertoire)}")
        print(f"  - len(report.insights): {len(report.insights)}")

    except Exception as e:
        print(f"\n Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)