-- Check if puzzles table exists and has data
SELECT COUNT(*) as total_puzzles FROM puzzles;
SELECT id, fen, moves, rating FROM puzzles LIMIT 1;
