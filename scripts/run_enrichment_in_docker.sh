#!/bin/bash
# Run ECO enrichment inside Docker container with proper database access

set -e

MODE="${1:---test}"

echo "Copying files to postgres container..."
docker cp eco-service/eco.pgn postgres:/tmp/eco.pgn
docker cp scripts/enrich_puzzles_optimized.py postgres:/tmp/enrich_puzzles_optimized.py

echo "Installing dependencies in container..."
docker exec postgres bash -c "pip3 install rapidfuzz chess asyncpg --quiet || apt-get update && apt-get install -y python3-pip && pip3 install rapidfuzz chess asyncpg"

echo "Running enrichment..."
docker exec -e DATABASE_URL="postgresql://your_db_user:your_db_password@localhost:5432/ostadchess" \
  -e ECO_PGN_PATH="/tmp/eco.pgn" \
  postgres python3 /tmp/enrich_puzzles_optimized.py $MODE

echo "Done!"
