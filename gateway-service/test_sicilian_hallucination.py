#!/usr/bin/env python3
"""
Test the LLM's response to Sicilian Defense position: 1.e4 c5 2.Nf3

This tests whether the LLM hallucinates about a d4 pawn that doesn't exist.
The position after 1.e4 c5 2.Nf3 has NO white pawn on d4, yet opening theory
might make the LLM think c5 "attacks d4".

Expected: LLM should NOT mention d4 pawn since it doesn't exist yet
"""
import asyncio
import httpx
import json
from datetime import datetime, timezone

# Sicilian Defense after 1.e4 c5 2.Nf3
FEN_AFTER_NF3 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"

async def test_sicilian_position():
    """Test LLM analysis of Sicilian Defense position"""

    # Gateway URL (adjust if needed)
    gateway_url = "http://localhost:8010"

    payload = {
        "fen": FEN_AFTER_NF3,
        "current_fen": FEN_AFTER_NF3,
        "last_move": "Nf3",
        "move_history": ["e4", "c5", "Nf3"],
        "include_llm": True,
        "multipv": 3,
        "depth": 18,
        "user_question": "Analyze the position after 1.e4 c5 2.Nf3. What is Black's pawn on c5 doing?"
    }

    print("=" * 80)
    print("TESTING: Sicilian Defense Hallucination Fix")
    print("=" * 80)
    print(f"Position: 1.e4 c5 2.Nf3")
    print(f"FEN: {FEN_AFTER_NF3}")
    print()
    print("KEY TEST: There is NO pawn on d4 yet!")
    print("The LLM should NOT say 'c5 attacks d4 pawn' because d4 is empty")
    print()
    print("-" * 80)
    print("Sending request to gateway...")
    print("-" * 80)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{gateway_url}/chess/analyze_with_llm",
                json=payload,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code != 200:
                print(f"ERROR: Gateway returned {response.status_code}")
                print(f"Response: {response.text}")
                return

            result = response.json()

            # Extract LLM response
            llm_data = result.get("llm", {})

            if "error" in llm_data:
                print(f"LLM ERROR: {llm_data['error']}")
                return

            choices = llm_data.get("choices", [])
            if not choices:
                print("ERROR: No choices in LLM response")
                return

            message = choices[0].get("message", {})
            content = message.get("content", "")

            print()
            print("=" * 80)
            print("LLM RESPONSE:")
            print("=" * 80)
            print(content)
            print()
            print("=" * 80)
            print("HALLUCINATION CHECK:")
            print("=" * 80)

            # Check for hallucinations
            hallucinations = []

            if "d4 pawn" in content.lower() or "pawn on d4" in content.lower():
                hallucinations.append("HALLUCINATION: Mentioned 'd4 pawn' which doesn't exist!")

            if "attacks d4" in content.lower() and "pawn" in content.lower():
                hallucinations.append("HALLUCINATION: Said c5 'attacks d4' pawn (no pawn there)!")

            if "controls d4" in content.lower() or "eyes d4" in content.lower():
                # This is OK - controlling an empty square is valid
                print("GOOD: Mentions controlling d4 square (valid - it's about the square, not a piece)")

            # Check for good indicators
            good_signs = []

            if "center" in content.lower() and ("control" in content.lower() or "influence" in content.lower()):
                good_signs.append("GOOD: Discusses center control/influence")

            if "develop" in content.lower():
                good_signs.append("GOOD: Mentions development")

            if "knight" in content.lower() and "f3" in content.lower():
                good_signs.append("GOOD: Correctly identifies knight on f3")

            print()
            if hallucinations:
                print("HALLUCINATIONS DETECTED:")
                for h in hallucinations:
                    print(f"  {h}")
                print()
                print("VERDICT: FAILED - LLM is still hallucinating about pieces")
            else:
                print("NO HALLUCINATIONS DETECTED")
                print()
                print("VERDICT: PASSED - LLM correctly analyzed the actual position")

            if good_signs:
                print()
                print("POSITIVE SIGNS:")
                for g in good_signs:
                    print(f"  {g}")

            print()
            print("=" * 80)

            # Print full board description sent to LLM
            if result.get("stockfish"):
                print()
                print("=" * 80)
                print("STOCKFISH ANALYSIS (for reference):")
                print("=" * 80)
                analysis = result["stockfish"].get("analysis", [])
                if analysis:
                    for i, move_data in enumerate(analysis[:3], 1):
                        move = move_data.get("move", "?")
                        score = move_data.get("score", "?")
                        print(f"{i}. {move} (eval: {score})")

    except httpx.TimeoutException:
        print("ERROR: Request timed out (LLM service might be cold starting)")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_sicilian_position())
