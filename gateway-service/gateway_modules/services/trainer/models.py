from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from uuid import UUID

class TrainerStatus(str, Enum):
    NO_ACCOUNT = "NO_ACCOUNT"
    BOOTSTRAP_REPORTS_CREATED = "BOOTSTRAP_REPORTS_CREATED"
    ACTIVE_TRAINER = "ACTIVE_TRAINER"
    NEEDS_RELINK = "NEEDS_RELINK"

class TrainerState(BaseModel):
    user_id: UUID
    state: TrainerStatus
    linked_account_id: Optional[int] = None
    last_daily_sync_at: Optional[datetime] = None
    last_deep_update_at: Optional[datetime] = None
    new_games_since_deep_update: int = 0
    updated_at: datetime

class TrainerReport(BaseModel):
    id: UUID
    user_id: UUID
    source_account_id: Optional[int] = None
    time_control: str
    game_ids: List[int]
    summary_metrics: Dict[str, Any]
    is_bootstrap: bool = False
    status: str = "active"
    deactivation_reason: Optional[str] = None
    created_at: datetime

class DailyCommentary(BaseModel):
    id: UUID
    user_id: UUID
    report_date: datetime
    commentary_text: str
    game_ids_analyzed: List[int] = []
    concepts_detected: Dict[str, Any] = {}
    created_at: datetime

class TrainerSnapshot(BaseModel):
    id: UUID
    user_id: UUID
    narrative_focus: Optional[str] = None
    long_term_patterns: Dict[str, Any] = {}
    lc0_insights: Dict[str, Any] = {}
    created_at: datetime
