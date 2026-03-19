"""
Test script for saving repertoires
"""
import asyncio
import httpx
import uuid
import os

# Configuration
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8010")

async def test_save_repertoire():
    """Test saving a suggested repertoire"""
    print("Testing repertoire save endpoint...")

    # Create test payload
    payload = {
        "name": "Test Core Repertoire",
        "category": "core",
        "eco_codes": ["C24", "D00", "C26"],
        "openings": [
            {
                "eco": "C24",
                "name": "Bishop's Opening",
                "color": "white",
                "games_count": 15,
                "winrate": 0.6,
                "frequency": 0.3
            },
            {
                "eco": "D00",
                "name": "Queen's Pawn Game",
                "color": "white",
                "games_count": 20,
                "winrate": 0.55,
                "frequency": 0.4
            },
            {
                "eco": "C26",
                "name": "Vienna Game",
                "color": "white",
                "games_count": 10,
                "winrate": 0.5,
                "frequency": 0.2
            }
        ],
        "color": "white"
    }

    async with httpx.AsyncClient() as client:
        try:
            # Make POST request
            print(f"\nSending POST request to {GATEWAY_URL}/repertoires")
            print(f"Payload: {payload}")

            response = await client.post(
                f"{GATEWAY_URL}/repertoires",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-session-id": str(uuid.uuid4())  # Use session ID for testing
                },
                timeout=10.0
            )

            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")

            if response.status_code == 201:
                result = response.json()
                print(f"\n✅ SUCCESS! Repertoire saved successfully")
                print(f"Repertoire ID: {result.get('id')}")
                print(f"Name: {result.get('name')}")
                print(f"Category: {result.get('category')}")
                print(f"Color: {result.get('color')}")
                print(f"Total Games: {result.get('total_games')}")
                print(f"Avg Winrate: {result.get('avg_winrate')}")
                return True
            else:
                print(f"\n❌ FAILED with status {response.status_code}")
                print(f"Response body: {response.text}")
                return False

        except Exception as e:
            print(f"\n❌ ERROR: {type(e).__name__}: {e}")
            return False


async def test_save_developing_repertoire():
    """Test saving a developing category repertoire"""
    print("\n\n" + "="*60)
    print("Testing 'developing' category repertoire...")
    print("="*60)

    payload = {
        "name": "Test Developing Repertoire",
        "category": "developing",
        "eco_codes": ["E60", "A00"],
        "openings": [
            {
                "eco": "E60",
                "name": "King's Indian Defense",
                "color": "black",
                "games_count": 8,
                "winrate": 0.5,
                "frequency": 0.5
            },
            {
                "eco": "A00",
                "name": "Polish Opening",
                "color": "white",
                "games_count": 5,
                "winrate": 0.4,
                "frequency": 0.3
            }
        ],
        "color": "both"
    }

    async with httpx.AsyncClient() as client:
        try:
            print(f"\nSending POST request to {GATEWAY_URL}/repertoires")
            print(f"Payload: {payload}")

            response = await client.post(
                f"{GATEWAY_URL}/repertoires",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-session-id": str(uuid.uuid4())
                },
                timeout=10.0
            )

            print(f"\nResponse Status: {response.status_code}")

            if response.status_code == 201:
                result = response.json()
                print(f"\n✅ SUCCESS! Developing repertoire saved")
                print(f"Repertoire ID: {result.get('id')}")
                print(f"Category: {result.get('category')}")
                return True
            else:
                print(f"\n❌ FAILED with status {response.status_code}")
                print(f"Response body: {response.text}")
                return False

        except Exception as e:
            print(f"\n❌ ERROR: {type(e).__name__}: {e}")
            return False


async def main():
    """Run all tests"""
    print("="*60)
    print("REPERTOIRE SAVE ENDPOINT TESTS")
    print("="*60)

    results = []

    # Test 1: Save core repertoire
    results.append(await test_save_repertoire())

    # Test 2: Save developing repertoire
    results.append(await test_save_developing_repertoire())

    # Summary
    print("\n\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Total tests: {len(results)}")
    print(f"Passed: {sum(results)}")
    print(f"Failed: {len(results) - sum(results)}")

    if all(results):
        print("\n✅ All tests passed!")
        return 0
    else:
        print("\n❌ Some tests failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
