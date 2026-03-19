"""
LC0 Premium Access Control Configuration.

Gates LC0 premium features by both feature flags AND user subscription status.
If user is not premium, all LC0 features are silently disabled.
"""

from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .ml_config import MLConfig


@dataclass
class LC0PremiumContext:
    """
    Runtime context for LC0 premium features.
    
    Encapsulates the gating logic so callers don't need to check
    multiple conditions themselves.
    """
    user_is_premium: bool = False
    reports_enabled: bool = False
    puzzles_enabled: bool = False
    repertoire_enabled: bool = False
    insights_enabled: bool = False
    
    # Sampling limits from config
    max_positions_per_report: int = 80
    timeout_seconds: float = 30.0
    
    @property
    def any_enabled(self) -> bool:
        """True if any LC0 premium feature is enabled."""
        return (
            self.reports_enabled or 
            self.puzzles_enabled or 
            self.repertoire_enabled or 
            self.insights_enabled
        )
    
    @property
    def all_enabled(self) -> bool:
        """True if all LC0 premium features are enabled."""
        return (
            self.reports_enabled and 
            self.puzzles_enabled and 
            self.repertoire_enabled and 
            self.insights_enabled
        )


def get_lc0_premium_context(
    subscription_status: Optional[str],
    ml_config: "MLConfig"
) -> LC0PremiumContext:
    """
    Gate LC0 features by both flag AND premium status.
    
    Args:
        subscription_status: User's subscription status from DB (e.g., 'free', 'premium')
        ml_config: MLConfig instance with LC0 flags
    
    Returns:
        LC0PremiumContext with all features enabled/disabled appropriately.
        Returns context with all False if user not premium.
    
    Example:
        >>> context = get_lc0_premium_context('premium', ml_config)
        >>> if context.any_enabled:
        ...     overlays = build_lc0_overlays(report, context)
    """
    # Check premium status - if not premium, everything is disabled
    is_premium = subscription_status in {"premium", "active", "trialing"}
    
    if not is_premium:
        # Return context with all features disabled
        return LC0PremiumContext(
            user_is_premium=False,
            max_positions_per_report=ml_config.lc0_max_positions_per_report,
            timeout_seconds=ml_config.lc0_timeout_seconds,
        )
    
    # User is premium - check individual flags
    # If lc0_premium_all is True, enable all features
    all_enabled = ml_config.lc0_premium_all
    
    return LC0PremiumContext(
        user_is_premium=True,
        reports_enabled=all_enabled or ml_config.lc0_premium_reports,
        puzzles_enabled=all_enabled or ml_config.lc0_premium_puzzles,
        repertoire_enabled=all_enabled or ml_config.lc0_premium_repertoire,
        insights_enabled=all_enabled or ml_config.lc0_premium_insights,
        max_positions_per_report=ml_config.lc0_max_positions_per_report,
        timeout_seconds=ml_config.lc0_timeout_seconds,
    )


def is_lc0_premium_available(
    subscription_status: Optional[str],
    ml_config: "MLConfig"
) -> bool:
    """
    Quick check if any LC0 premium feature is available for this user.
    
    Args:
        subscription_status: User's subscription status
        ml_config: MLConfig instance
        
    Returns:
        True if user is premium AND at least one LC0 flag is enabled.
    """
    context = get_lc0_premium_context(subscription_status, ml_config)
    return context.any_enabled
