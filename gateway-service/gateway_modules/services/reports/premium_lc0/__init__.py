"""
LC0 Premium Overlay Modules.

Provides additive overlays for premium report augmentation.
All overlays are optional and never modify baseline data.
"""

from .lc0_puzzle_overlay import generate_puzzle_overlay
from .lc0_repertoire_overlay import generate_repertoire_overlay
from .lc0_insight_overlay import generate_insight_overlay
from .lc0_report_overlay import generate_report_overlay
from .lc0_compare import generate_comparison_summary
from .orchestrator import build_lc0_overlays

__all__ = [
    'generate_puzzle_overlay',
    'generate_repertoire_overlay',
    'generate_insight_overlay',
    'generate_report_overlay',
    'generate_comparison_summary',
    'build_lc0_overlays',
]
