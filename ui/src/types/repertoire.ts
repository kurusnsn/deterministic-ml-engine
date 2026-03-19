// TypeScript types for chess repertoire analysis

export type RepertoireType = 'core' | 'secondary' | 'experimental' | 'repair';

export interface RepertoireBucketOpening {
  eco_code: string;
  color: 'white' | 'black';
  note?: string;
}

export interface RepertoirePuzzle {
  puzzle_id: string;
  eco_code?: string | null;
  move_number?: number | null;
  mistake_type?: string | null;
  source_report_id?: string | null;
}

export interface RepertoireBucket {
  id: string;
  user_id: string;
  name: string;
  type: RepertoireType; // user-managed bucket
  color: 'white' | 'black' | 'both';
  openings: RepertoireBucketOpening[];
  puzzles?: RepertoirePuzzle[] | null;
  created_at: string;
  updated_at: string;
}

export interface OpeningStats {
  eco_code: string;
  opening_name: string;
  color: "white" | "black";
  games_count: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number; // 0.0 to 1.0
  frequency: number; // 0.0 to 1.0
  avg_time_seconds?: number;
  median_time_seconds?: number;
  repertoire_tags?: RepertoireType[]; // user-managed bucket membership
  // Style alignment fields
  user_is_system_side?: boolean;
  style_alignment_score?: number | null;
  style_fit_label?: "aligned" | "neutral" | "misaligned" | null;
  style_tags?: string[];
}

export interface RepertoireGroup {
  category: "core" | "repair" | "expansion" | "experimental" | "developing";
  description: string;
  openings: OpeningStats[];
  total_games: number;
  avg_winrate: number;
}

export interface RepertoireInsight {
  type: "warning" | "suggestion" | "strength" | "eval_swing";
  message: string;
  opening_eco?: string;
  priority: "high" | "medium" | "low";
}

// NEW: Move Analysis Types
export interface MoveEval {
  cp: number;
  depth: number;
  mate: number | null;
}

export interface Heuristics {
  // Tactical patterns
  fork: boolean;
  pin: boolean;
  skewer: boolean;
  xray: boolean;
  hanging_piece: boolean;
  trapped_piece: boolean;
  overloaded_piece: boolean;
  discovered_attack: boolean;

  // Positional features
  weak_squares: string[];
  outposts: string[];
  king_safety_drop: boolean;

  // Pawn structure
  pawn_structure: {
    isolated_pawns: string[];
    doubled_pawns: string[];
    passed_pawns: string[];
  };

  // Mobility
  mobility_score: number;
}

export interface MoveAnalysis {
  ply: number;
  move: string;
  fen_before: string;
  fen_after: string;
  eval: MoveEval;
  eval_delta: number;
  mistake_type: 'inaccuracy' | 'mistake' | 'blunder' | 'missed_win' | null;
  best_move: string;
  pv: string[];
  heuristics: Heuristics;
  // ECO info for per-opening filtering
  eco?: string;
  opening_name?: string;
}

// NEW: Weak Line Types
export interface WeakLine {
  id: string;
  eco: string | null;
  line: string[];
  games_count: number;
  winrate: number;
  avg_eval_swing: number;
  common_mistakes: string[];
  tactical_issues: string[];
  puzzle_ids: string[];
}

// NEW: Generated Puzzle Types
export interface GeneratedPuzzle {
  puzzle_id: string;
  game_id: string;
  move_ply: number;
  fen: string;
  side_to_move: 'white' | 'black';
  best_move: string;
  theme: string[];
  mistake_move: string;
  weak_line_id: string | null;
  eco?: string;
  move_number?: number;
  mistake_type?: string;
}

// NEW: Charts Additional Types
export interface EvalSwingChartEntry {
  ply: number;
  eval: number; // in pawns
}

export interface AggregatedEvalEntry {
  ply: number;
  avg_eval: number;
  avg_cp_loss: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  sample_size: number;
}

export interface TacticalPatternChartEntry {
  pattern: string;
  count: number;
}

// NEW: Redesigned Tactical Motif Types
export interface PhaseDistribution {
  opening: number;
  middlegame: number;
  endgame: number;
}

export interface MoveExample {
  game_id: string;
  ply: number;
  move: string;
  fen_before: string;
  cp_loss: number;
  mistake_type: string;
}

export interface MistakeMotifEntry {
  motif: string;
  count: number;
  avg_cp_loss: number;
  critical_ply_range?: [number, number];
  frequent_openings: string[];
  phase_distribution: PhaseDistribution;
  example_moves?: MoveExample[];
  nl_insight?: string;
}

export interface DefensiveMotifEntry {
  motif: string;
  count: number;
  avg_cp_loss: number;
  vulnerable_openings: string[];
  piece_patterns: string[];
  phase_distribution: PhaseDistribution;
  nl_insight?: string;
}

export type HighlightType = "brilliant" | "comeback" | "save" | "perfect_opening" | "tactical_sequence";

export interface Highlight {
  type: HighlightType;
  game_id: string;
  ply: number;
  eco?: string;
  cp_change: number;
  description: string;
  motifs: string[];
  related_puzzles: string[];
  fen_before?: string;
  move?: string;
}

export interface ChartsAdditional {
  eval_swing_chart?: EvalSwingChartEntry[];
  eval_swing_aggregated?: AggregatedEvalEntry[];
  tactical_pattern_chart: TacticalPatternChartEntry[];
  mistake_motifs?: MistakeMotifEntry[];
  defensive_motifs?: DefensiveMotifEntry[];
}

// ========================================
// Playstyle Profile Types
// ========================================

export interface StyleScore {
  tactical: number;
  positional: number;
  aggressive: number;
  defensive: number;
  open_positions: number;
  closed_positions: number;
  risk?: number | null;
}

export interface StyleAlignment {
  eco: string;
  opening_name: string;
  color: "white" | "black";
  bucket?: "core" | "secondary" | "experimental" | "problem" | null;
  alignment_score: number;
  tags: string[];
}

// NEW: Population Normalized Metrics
export interface NormalizedMetric {
  raw: number;
  relative_z: number;
  percentile: number;
  bucket: string;
  interpretation: string;
  confidence: "low" | "medium" | "high";
}

export interface EntropyMetric {
  value: number;
  label: string;
  interpretation: string;
}

export interface PopulationNormalizedMetrics {
  aggression: NormalizedMetric | null;
  volatility: NormalizedMetric | null;
  style_entropy: EntropyMetric | null;
  rating_bucket: number | null;
  speed: string | null;
  era: string | null;
  sample_games: number | null;
}

export interface PlaystyleProfile {
  overall: StyleScore;
  white: StyleScore;
  black: StyleScore;
  radar_axes: string[];
  radar_data_overall: number[];
  radar_data_white: number[];
  radar_data_black: number[];
  aligned_openings: StyleAlignment[];
  misaligned_openings: StyleAlignment[];
  neutral_openings: StyleAlignment[];
  summary?: string | null;
  recommendations: string[];
  population_metrics?: PopulationNormalizedMetrics;
}

export interface OpeningSuggestion {
  eco: string;
  name: string;
  color: "white" | "black";
  match_score: number;
  tags: string[];
  reason: string;
}

export interface RepertoireSuggestions {
  white: OpeningSuggestion[];
  black: OpeningSuggestion[];
}

export interface RepertoireFitItem {
  eco: string;
  opening_name: string;
  color: "white" | "black";
  bucket_type: "core" | "secondary" | "experimental" | "repair";
  games_count: number;
  winrate: number;
  style_alignment_score: number;
  style_fit_label: "aligned" | "neutral" | "misaligned";
  style_tags: string[];
}

// ========================================
// LC0 Premium Types
// ========================================

export interface LC0PuzzleAnnotation {
  lc0_value: number;
  policy_entropy: number;
  tags: string[];
  alt_top_moves: { uci: string; p: number }[];
  human_likeliness?: number | null;
}

export interface LC0NodeSuggestion {
  lc0_top_moves: { uci: string; p: number }[];
  baseline_move_in_topk: boolean;
  disagreement: boolean;
  diversity_suggestion?: string | null;
}

export interface LC0ExtraInsight {
  type: "lc0_disagreement" | "conversion_difficulty" | "tension_handling";
  title: string;
  severity: "info" | "warning";
  evidence: {
    fen?: string;
    baseline_best?: string;
    lc0_top?: string;
    lc0_entropy?: number;
    count?: number;
    avg_entropy?: number;
    examples?: { fen: string; value: number; entropy: number }[];
    interpretation?: string;
  };
}

export interface LC0EntropySummary {
  avg: number;
  median?: number;
  p90: number;
  min: number;
  max: number;
  count?: number;
}

export interface LC0HardPosition {
  fen: string;
  entropy: number;
  context: "puzzle" | "weak_line" | "turning_point" | "opening" | "other" | "unknown";
}

export interface LC0StyleFingerprint {
  avg_entropy: number;
  entropy_variance: number;
  entropy_std?: number;
  decisive_tendency: number;
  complexity_preference: "simple" | "moderate" | "complex";
}

export interface LC0PremiumOverlay {
  meta: {
    model: string;
    net_id: string;
    computed_at: string;
    positions_evaluated?: number;
    computation_time_ms?: number;
  };
  report_overlays?: {
    entropy_summary: LC0EntropySummary;
    hard_positions: LC0HardPosition[];
    style_fingerprint?: LC0StyleFingerprint;
  };
  puzzle_overlays?: {
    reranked_puzzle_ids: string[];
    puzzle_annotations: Record<string, LC0PuzzleAnnotation>;
  };
  repertoire_overlays?: {
    node_suggestions: Record<string, LC0NodeSuggestion>;
  };
  insight_overlays?: {
    extra_insights: LC0ExtraInsight[];
  };
  comparison?: {
    puzzles_reranked: boolean;
    puzzles_with_annotations: number;
    puzzles_high_tension?: number;
    puzzles_ambiguous?: number;
    repertoire_nodes_analyzed: number;
    repertoire_nodes_with_disagreement: number;
    extra_insights_count: number;
    insights_by_type?: Record<string, number>;
  };
}

export interface RepertoireReport {
  id?: string; // For saved reports
  user_id: string;
  name?: string; // For saved reports
  total_games: number;
  white_games: number;
  black_games: number;
  analysis_date: string;
  white_repertoire: Record<string, RepertoireGroup>;
  black_repertoire: Record<string, RepertoireGroup>;
  insights: RepertoireInsight[];
  overall_winrate: number;
  created_at?: string;
  updated_at?: string;
  result_breakdown?: Record<'win' | 'loss' | 'draw', number>;
  time_usage?: TimeUsageEntry[];
  game_length_histogram?: GameLengthHistogramEntry[];
  time_control_breakdown?: TimeControlBreakdownEntry[];
  time_control_filter?: string;
  source_usernames?: string[];

  // NEW OPTIONAL FIELDS
  engine_analysis?: {
    moves: MoveAnalysis[];
  };
  weak_lines?: WeakLine[];
  generated_puzzles?: GeneratedPuzzle[];
  charts_additional?: ChartsAdditional;
  suggested_repertoires?: SuggestedRepertoire[];
  user_repertoires?: RepertoireBucket[];
  highlights?: Highlight[];
  playstyle_profile?: PlaystyleProfile;
  repertoire_fit?: RepertoireFitItem[];

  // LC0 Premium Augmentation (only present for premium users when flags enabled)
  premium_lc0?: LC0PremiumOverlay;
}

export interface TimeUsageEntry {
  game_id: string;
  opening: string;
  moves?: number | null;
  duration?: number | null;
  avg_move_time?: number | null;
  result: 'win' | 'loss' | 'draw';
  lost_on_time?: boolean;
  end_time?: string | null;
  time_control?: string;
  time_control_label?: string;
  color?: 'white' | 'black';
}

export interface GameLengthHistogramEntry {
  bucket: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface TimeControlBreakdownEntry {
  key: string;
  label: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  losses_on_time?: number;
  average_moves?: number | null;
  average_move_time?: number | null;
}

export interface ImportRequest {
  platform: "lichess.org" | "chess.com";
  username: string;
  time_control?: string;
  rated?: boolean;
  max_games: number;
}

export interface DateRange {
  start_date?: string;
  end_date?: string;
}

export interface RepertoireAnalysisRequest {
  user_id?: string;
  session_id?: string;
  min_games: number;
  min_games_threshold?: number;
  usernames?: string[]; // Multi-account support
  import_request?: ImportRequest; // Smart import support
  date_range?: DateRange;
  force_import?: boolean;
}

export interface SavedReport {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  total_games: number;
  overall_winrate: number;
  preview_openings: string[]; // ECO codes for preview
  source_usernames?: string[]; // Usernames that contributed to this report
  is_multi_account?: boolean; // Whether this report aggregates multiple accounts
}

// UI State types
export interface OpeningSelection {
  [key: string]: boolean; // ECO code -> selected
}

export interface FilterState {
  color?: "white" | "black" | "all";
  category?: string;
  sortBy: "games" | "winrate" | "frequency" | "eco";
  sortOrder: "asc" | "desc";
  searchTerm: string;
  minGames: number;
  winrateRange: [number, number];
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
  category?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  detail: string;
  status?: number;
}

// Smart import progress tracking
export interface ImportProgress {
  existing_games: number;
  newly_imported: number;
  total_processed: number;
  status: "starting" | "checking" | "importing" | "analyzing" | "completed" | "error";
  message: string;
  error?: string;
}

export interface SmartImportResult {
  success: boolean;
  existing_games_count: number;
  newly_imported_count: number;
  total_games_available: number;
  skipped_import: boolean;
  error_message?: string;
  import_summary: string;
}

// Streaming response types
export interface StreamingProgress {
  type: "progress";
  status: string;
  message: string;
  existing_games: number;
  newly_imported: number;
  total_processed: number;
  error?: string;
}

export interface StreamingComplete {
  type: "complete";
  result: RepertoireReport & {
    import_summary?: string;
    existing_games_count?: number;
    newly_imported_count?: number;
  };
}

export interface StreamingError {
  type: "error";
  message: string;
}

export type StreamingMessage = StreamingProgress | StreamingComplete | StreamingError;

// Repertoire Management Types
export interface SavedRepertoire {
  id: string;
  name: string;
  eco_codes: string[];
  openings: RepertoireOpening[];
  puzzles?: RepertoirePuzzle[];
  source_report_id?: string;
  favorite: boolean;
  created_at: string;
  updated_at: string;
  category: "core" | "repair" | "expansion" | "experimental";
  total_games: number;
  avg_winrate: number;
  color: "white" | "black" | "both";
  time_control?: string; // e.g., "bullet", "blitz", "rapid", "classical"
}

export interface RepertoireOpening {
  eco: string;
  name: string;
  color: "white" | "black";
  games_count: number;
  winrate: number;
  frequency: number;
}

export interface SuggestedRepertoire {
  id: string;
  name: string;
  category?: "core" | "repair" | "expansion" | "experimental";
  eco_codes: string[];
  openings: RepertoireOpening[];
  description?: string;
  total_games?: number;
  avg_winrate?: number;
  color: "white" | "black" | "both";
  source_report_id?: string;
  target_bucket_type?: RepertoireType;
  puzzles?: RepertoirePuzzle[];
}

// API Request/Response types for repertoire management
export interface SaveRepertoireRequest {
  name: string;
  eco_codes: string[];
  openings: RepertoireOpening[];
  source_report_id?: string;
  category: "core" | "repair" | "expansion" | "experimental";
  color: "white" | "black" | "both";
  puzzles?: RepertoirePuzzle[];
  time_control?: string; // e.g., "bullet", "blitz", "rapid", "classical"
}

export interface UpdateRepertoireRequest extends Partial<SaveRepertoireRequest> {
  id: string;
  favorite?: boolean;
}

export interface RepertoireStatsResponse {
  total_repertoires: number;
  favorite_count: number;
  categories: Record<string, number>;
  avg_winrate: number;
}

// Game Analysis Types (Accuracy & Elo Estimation)
export interface AccuracyMetrics {
  white: number;  // 0-100
  black: number;  // 0-100
}

export interface EloEstimate {
  estimated: number;      // Pure CPL-based estimate
  adjusted?: number | null;      // Adjusted using known rating
  known_rating?: number | null;  // Actual rating from game
}

export interface EloEstimates {
  white: EloEstimate;
  black: EloEstimate;
}

export interface GameAnalysisMoveEntry {
  ply: number;
  move: string;
  fen_before: string;
  fen_after: string;
  eval: {
    cp: number;
    depth: number;
    mate: number | null;
  };
  prev_eval: {
    cp: number;
    mate: number | null;
  };
  best_move: string;
  pv: string[];
}

export interface GameAnalysisResponse {
  move_analyses: GameAnalysisMoveEntry[];
  accuracy_metrics: AccuracyMetrics;
  elo_estimates: EloEstimates;
  engine_annotations?: MoveEngineAnnotation[];
}

// Engine annotations for game review UI
export interface HeuristicSummary {
  advantage: string;
  commentary: string;
  whiteScore: number;
  blackScore: number;
  eval: number;
}

export interface MoveEngineAnnotation {
  plyIndex: number;
  moveSan: string;
  sideToMove: "white" | "black";
  evalCp: number;
  evalDelta: number;
  mistakeType: string | null;
  bestMoveSan: string | null;
  bestMoveUci: string | null;
  betterMoveExists: boolean;
  pvSan: string[] | null;
  pvUci: string[] | null;
  heuristicSummary?: HeuristicSummary;
}

