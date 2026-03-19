"""
LC0 Premium Overlay Orchestrator.

Coordinates the generation of all LC0 premium overlays.
Entry point for wiring into report generation.
"""

import logging
import time
from datetime import datetime
from typing import Dict, Any, Optional

from gateway_modules.config.lc0_premium_config import LC0PremiumContext
from gateway_modules.analysis.lc0 import get_lc0_service
from gateway_modules.services.reports.lc0_position_sampler import (
    sample_positions_for_lc0,
    SampledPositions
)
from .lc0_puzzle_overlay import generate_puzzle_overlay
from .lc0_repertoire_overlay import generate_repertoire_overlay
from .lc0_insight_overlay import generate_insight_overlay
from .lc0_report_overlay import generate_report_overlay
from .lc0_compare import generate_comparison_summary

logger = logging.getLogger(__name__)


def build_lc0_overlays(
    report: Dict[str, Any],
    context: LC0PremiumContext,
    timeout_seconds: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build all LC0 premium overlays for a report.
    
    This is the main entry point called from report generation.
    Coordinates position sampling, LC0 evaluation, and overlay generation.
    
    Args:
        report: Baseline report data (dict or model)
        context: LC0 premium context with feature flags
        timeout_seconds: Override for LC0 evaluation timeout
        
    Returns:
        Complete premium_lc0 overlay or None if nothing to add
        
    Example usage in repertoire_service.py:
        if lc0_context.any_enabled:
            overlays = build_lc0_overlays(report, context)
            if overlays:
                report["premium_lc0"] = overlays
    """
    if not context.any_enabled:
        return None
    
    start_time = time.perf_counter()
    timeout = timeout_seconds or context.timeout_seconds
    
    # Convert model to dict if needed
    if hasattr(report, 'model_dump'):
        report_dict = report.model_dump()
    else:
        report_dict = report
    
    logger.info(
        f"Building LC0 overlays: reports={context.reports_enabled}, "
        f"puzzles={context.puzzles_enabled}, repertoire={context.repertoire_enabled}, "
        f"insights={context.insights_enabled}"
    )
    
    # Step 1: Sample positions for LC0 evaluation
    sampled = sample_positions_for_lc0(
        report_dict,
        max_positions=context.max_positions_per_report,
        seed=42  # Deterministic for reproducibility
    )
    
    if sampled.total_count == 0:
        logger.info("No positions sampled for LC0 - skipping overlays")
        return None
    
    # Check timeout
    elapsed = time.perf_counter() - start_time
    if elapsed > timeout:
        logger.warning(f"LC0 timeout after sampling: {elapsed:.1f}s")
        return None
    
    # Step 2: Run LC0 evaluation on all sampled positions
    lc0_service = get_lc0_service()
    remaining_timeout = timeout - elapsed
    
    all_fens = sampled.all_fens
    lc0_results_list = lc0_service.evaluate_positions(
        all_fens,
        topk=8,
        timeout_seconds=remaining_timeout
    )
    
    # Convert list to dict by FEN
    lc0_results: Dict[str, Dict[str, Any]] = {}
    for i, fen in enumerate(all_fens):
        if i < len(lc0_results_list) and lc0_results_list[i]:
            lc0_results[fen] = lc0_results_list[i].to_dict()
    
    if not lc0_results:
        logger.warning("LC0 evaluation returned no results")
        return None
    
    logger.info(f"LC0 evaluated {len(lc0_results)} positions")
    
    # Step 3: Generate overlays based on enabled features
    puzzle_overlay = None
    repertoire_overlay = None
    insight_overlay = None
    report_overlay = None
    
    if context.puzzles_enabled:
        puzzles = report_dict.get("generated_puzzles", [])
        puzzle_overlay = generate_puzzle_overlay(puzzles, lc0_results)
    
    if context.repertoire_enabled:
        repertoire_overlay = generate_repertoire_overlay(
            report_dict.get("white_repertoire", {}),
            report_dict.get("black_repertoire", {}),
            lc0_results,
            sampled.opening_fens
        )
    
    if context.insights_enabled:
        insight_overlay = generate_insight_overlay(
            report_dict.get("insights", []),
            lc0_results,
            sampled.turning_point_fens
        )
    
    if context.reports_enabled:
        report_overlay = generate_report_overlay(
            lc0_results,
            sampled.to_dict()
        )
    
    # Step 4: Generate comparison summary
    comparison = generate_comparison_summary(
        puzzle_overlay,
        repertoire_overlay,
        insight_overlay
    )
    
    # Step 5: Build final overlay structure
    total_time = time.perf_counter() - start_time
    
    result = {
        "meta": {
            "model": "lc0",
            "net_id": "T78",
            "computed_at": datetime.utcnow().isoformat(),
            "positions_evaluated": len(lc0_results),
            "computation_time_ms": round(total_time * 1000, 1),
        },
        "comparison": comparison,
    }
    
    # Add overlays only if they have content
    if puzzle_overlay:
        result["puzzle_overlays"] = puzzle_overlay
    
    if repertoire_overlay:
        result["repertoire_overlays"] = repertoire_overlay
    
    if insight_overlay:
        result["insight_overlays"] = insight_overlay
    
    if report_overlay:
        result["report_overlays"] = report_overlay
    
    logger.info(
        f"LC0 overlays complete in {total_time:.2f}s: "
        f"puzzles={'yes' if puzzle_overlay else 'no'}, "
        f"repertoire={'yes' if repertoire_overlay else 'no'}, "
        f"insights={'yes' if insight_overlay else 'no'}, "
        f"report={'yes' if report_overlay else 'no'}"
    )
    
    return result
