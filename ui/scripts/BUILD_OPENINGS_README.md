# Building Opening Trainer Data

This script generates forcing line data for the opening trainer by analyzing openings using Lichess Explorer API game statistics (game counts and winrates).

## Prerequisites

Make sure the **Opening Book Service** (port 5004) is running:

```bash
docker-compose up openingbook
```

> **Note**: Stockfish service is no longer required - we use Lichess game statistics instead of engine evaluations.

## Usage

### Build One Opening at a Time (Recommended)

Due to Lichess API rate limits (~20 req/sec), build openings one at a time:

1. Edit `scripts/build-openings.ts` and uncomment the opening you want:
   ```typescript
   const openings = [
     "italian",      // ✓ Uncommented = will build
     // "sicilian",  // ✗ Commented = skip
     // "stafford",
     // "london",
     // "queens-gambit"
   ];
   ```

2. Run the build script:
   ```bash
   npx tsx scripts/build-openings.ts
   ```

3. **Wait 5-10 minutes** before building the next opening (to let rate limits reset)

4. Repeat for each opening

### Output

Generated files will be saved to `opening-db/`:
- `italian.json`
- `sicilian.json`
- `stafford.json`
- `london.json`
- `queensgambit.json`

Each file contains:
- Opening name and metadata
- Forcing lines with game statistics
- Game counts and winrates for each move
- Forcing side (white or black)
- Source: lichess-db

## How It Works

1. **Fetches opening data** from Lichess Explorer API (via local opening-book service)
2. **Analyzes game statistics** - filters moves by game count (>= 1000) and winrate (>= 55% for forcing side)
3. **Explores forcing lines** - positions where one side has clear statistical advantage
4. **Stops expansion** when winrate stabilizes (45-55% range) or insufficient data
5. **Saves to JSON** - ready for the opening trainer UI to consume

## Rate Limiting

The script includes:
- Bottleneck rate limiter configured for ~16 req/sec (conservative)
- Request throttler in opening service limiting to 10 req/sec
- Automatic retries with exponential backoff
- 10-minute caching to reduce repeated calls

Even with these safeguards, each opening requires hundreds of API calls, so build them one at a time with appropriate delays.

## Troubleshooting

**502 errors from opening-book service:**
- Wait longer between builds (rate limit cooldown)
- Check that opening-book service is running
- Verify Docker containers have network connectivity

**No output files:**
- Check the `opening-db/` directory exists
- Verify you have write permissions
- Look for error messages in the console

**Insufficient forcing lines:**
- The opening might not have enough high-quality games in Lichess database
- Try adjusting MIN_GAME_COUNT or MIN_FORCING_WINRATE thresholds in generator.ts

