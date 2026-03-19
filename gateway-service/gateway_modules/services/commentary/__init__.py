"""
Commentary Module - Shared context and builders for LLM and non-LLM commentary.

This module provides a unified interface for generating commentary about
chess positions, ensuring both LLM and heuristic narrators use the same
computed facts and context.
"""

from .context import CommentaryContext
from .build_context import (
    build_commentary_context,
    build_commentary_context_from_analysis,
)

__all__ = [
    "CommentaryContext",
    "build_commentary_context",
    "build_commentary_context_from_analysis",
]
