"""
Gateway routers module.

Import all routers here for clean inclusion in app.py.
"""

from gateway_modules.routers import (
    studies,
    puzzles,
    health,
    games,
    imports,
    openings,
    game_sync,
    trainer,
    home,
    users,
    reports,
    analysis,
    repertoires,
    subscriptions,
)

__all__ = [
    "studies",
    "puzzles",
    "health",
    "games",
    "imports",
    "openings",
    "game_sync",
    "trainer",
    "home",
    "users",
    "reports",
    "analysis",
    "repertoires",
    "subscriptions",
]
