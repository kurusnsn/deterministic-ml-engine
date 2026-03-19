-- Import puzzles from CSV using PostgreSQL COPY
-- This is much faster than INSERT statements

-- Create a temporary table to hold the raw CSV data
CREATE TEMP TABLE temp_puzzles (
    puzzle_id TEXT,
    fen TEXT,
    moves TEXT,
    rating TEXT,
    rating_deviation TEXT,
    popularity TEXT,
    nb_plays TEXT,
    themes TEXT,
    game_url TEXT,
    opening_tags TEXT
);

-- Import CSV data into temp table
\COPY temp_puzzles FROM '/tmp/lichess_db_puzzle.csv' WITH (FORMAT CSV, HEADER true);

-- Insert into actual puzzles table with proper type conversions
INSERT INTO puzzles (id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, game_url, opening_tags)
SELECT
    puzzle_id,
    fen,
    string_to_array(moves, ' '),
    NULLIF(rating, '')::INT,
    NULLIF(rating_deviation, '')::INT,
    NULLIF(popularity, '')::INT,
    NULLIF(nb_plays, '')::INT,
    string_to_array(REPLACE(themes, ',', ' '), ' '),
    NULLIF(game_url, ''),
    string_to_array(REPLACE(opening_tags, ',', ' '), ' ')
FROM temp_puzzles
ON CONFLICT (id) DO NOTHING;

-- Show final count
SELECT COUNT(*) as total_puzzles FROM puzzles;
