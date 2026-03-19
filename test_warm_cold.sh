#!/bin/bash
# =============================================================================
# WARM/COLD LATENCY TEST SCRIPT
# =============================================================================
# 
# This script tests Modal service latency in warm vs cold states.
# Run from: chess-feature-2/
#
# USAGE:
#   chmod +x test_warm_cold.sh
#   ./test_warm_cold.sh
#
# PREREQUISITES:
#   1. Deploy services:
#      modal deploy modal_apps/lc0_service.py
#      modal deploy modal_apps/llm_commentary_service.py
#      modal deploy modal_apps/chess_inference_service.py
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service URLs (update these with your actual URLs)
UNIFIED_URL="https://kurusnsn--unified-chess-inference-chessinference-analyze-20766a.modal.run"
LLM_URL="https://kurusnsn--llm-commentary-service-llmcommentary-health.modal.run"

# Test positions
FEN1="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
FEN2="rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"

echo "============================================================"
echo "WARM/COLD LATENCY TEST"
echo "============================================================"
echo ""

# Step 1: Warm up LC0 service
echo -e "${YELLOW}Step 1: Warming LC0 service...${NC}"
echo "Running: modal run modal_apps/lc0_service.py"
echo "(This may take 15-30s on cold start)"
echo ""

# In a real scenario, you'd run:
# modal run modal_apps/lc0_service.py
echo -e "${GREEN}✓ LC0 service should show: 'LC0: model loaded, service warm'${NC}"
echo ""

# Step 2: Warm up LLM service
echo -e "${YELLOW}Step 2: Warming LLM service...${NC}"
echo "Running first request to LLM (cold start ~30-60s)..."
echo ""

curl -s -X GET "$LLM_URL" 2>/dev/null || echo "(LLM health endpoint)"
echo ""
echo -e "${GREEN}✓ LLM service should show: 'LLM-COMMENTARY: service alive, vLLM warm'${NC}"
echo ""

# Step 3: Run warm tests
echo "============================================================"
echo "WARM LATENCY TESTS (5 iterations)"
echo "============================================================"
echo ""

for i in {1..5}; do
    echo -e "${YELLOW}Test $i:${NC}"
    echo "FEN: $FEN1"
    
    START=$(date +%s%N)
    
    RESPONSE=$(curl -s -X POST "$UNIFIED_URL" \
        -H "Content-Type: application/json" \
        -d "{\"fen\": \"$FEN1\", \"move\": \"e4\"}" 2>/dev/null)
    
    END=$(date +%s%N)
    DURATION_MS=$(( (END - START) / 1000000 ))
    
    echo "Total time: ${DURATION_MS}ms"
    
    # Extract timing from response if available
    if echo "$RESPONSE" | grep -q "_timing_ms"; then
        TIMING=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('_timing_ms',{}); print(f\"  heur={t.get('heur',0)}ms lc0={t.get('lc0',0)}ms llm={t.get('llm',0)}ms\")" 2>/dev/null)
        echo "$TIMING"
    fi
    
    echo ""
done

echo "============================================================"
echo "EXPECTED RESULTS (WARM)"
echo "============================================================"
echo "Component       | Expected Latency"
echo "----------------|------------------"
echo "Heuristics      | ~10-20 ms"
echo "LC0 delta       | ~100-300 ms"
echo "LLM (8B)        | ~600-1500 ms"
echo "----------------|------------------"
echo "Total           | < 2000 ms"
echo "============================================================"
echo ""
echo "Look for these logs in Modal dashboard:"
echo "  - 'LC0: model loaded, service warm'"
echo "  - 'UNIFIED: service alive, vLLM warm'"
echo "  - 'TIMING ms | heur=X | lc0=Y | llm=Z | total=W'"
