-- 001_create_opening_book_stats.sql

CREATE TABLE IF NOT EXISTS opening_book_stats (
  fen             text        NOT NULL,
  move_uci        text        NOT NULL,
  speed           text        NOT NULL,   -- 'bullet' | 'blitz' | 'rapid' | 'classical'
  rating_bucket   int         NOT NULL,   -- 0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500 (2500 = 2500+)
  games           int         NOT NULL DEFAULT 0,
  white_wins      int         NOT NULL DEFAULT 0,
  draws           int         NOT NULL DEFAULT 0,
  black_wins      int         NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fen, move_uci, speed, rating_bucket)
);

CREATE INDEX IF NOT EXISTS idx_opening_book_stats_fen_speed_bucket
  ON opening_book_stats (fen, speed, rating_bucket);
