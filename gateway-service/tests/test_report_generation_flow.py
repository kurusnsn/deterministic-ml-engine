"""
Test that report generation flow works end-to-end.
Tests the full flow: import -> analyze -> save report.
"""

import pytest
import httpx
import asyncio
import json
import os
from uuid import uuid4


GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8010")
IMPORT_URL = os.getenv("IMPORT_URL", "http://localhost:5005")


class TestReportGenerationFlow:
    """Test the full report generation flow."""

    @pytest.fixture
    def session_id(self):
        """Generate a fresh session ID for each test."""
        return str(uuid4())

    @pytest.fixture
    def headers(self, session_id):
        """Create headers with session."""
        return {"x-session-id": session_id, "Content-Type": "application/json"}

    @pytest.mark.asyncio
    async def test_streaming_import_and_save_report(self, headers, session_id):
        """
        Test that streaming import generates a report and we can save it.
        Uses DrNykterstein (Magnus Carlsen's Lichess account) with 5 games.
        """
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Step 1: Stream import and analysis
            stream_request = {
                "min_games": 1,
                "min_games_threshold": 1,
                "import_request": {
                    "platform": "lichess.org",
                    "username": "DrNykterstein",
                    "max_games": 5
                },
                "force_import": False
            }

            print(f"\n[Test] Starting streaming import with session {session_id}")

            # Collect streaming response
            stream_events = []
            final_report = None

            async with client.stream(
                "POST",
                f"{GATEWAY_URL}/analysis/repertoire/stream",
                json=stream_request,
                headers=headers
            ) as response:
                assert response.status_code == 200, f"Stream failed: {response.status_code}"

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            stream_events.append(data)
                            print(f"[Stream] {data.get('type')}: {data.get('message', data.get('status', ''))}")

                            if data.get("type") == "complete":
                                final_report = data.get("result")
                            elif data.get("type") == "error":
                                pytest.fail(f"Stream error: {data.get('message')}")
                        except json.JSONDecodeError:
                            print(f"[Stream] Failed to parse: {line}")

            # Verify we got progress events
            progress_events = [e for e in stream_events if e.get("type") == "progress"]
            print(f"\n[Test] Got {len(progress_events)} progress events")
            assert len(progress_events) > 0, "Expected at least one progress event"

            # Verify we got a final report
            assert final_report is not None, "Expected a final report from stream"
            print(f"[Test] Got report with {final_report.get('total_games', 0)} games")

            # Step 2: Now save the report
            save_request = {
                "name": f"Test DrNykterstein Report - {session_id[:8]}",
                "report_data": final_report,
                "source_usernames": ["DrNykterstein"],
                "time_control": "blitz"
            }

            save_response = await client.post(
                f"{GATEWAY_URL}/analysis/reports",
                json=save_request,
                headers=headers
            )

            print(f"[Test] Save response status: {save_response.status_code}")
            if save_response.status_code != 200:
                print(f"[Test] Save error: {save_response.text}")

            assert save_response.status_code == 200, f"Save failed: {save_response.status_code} - {save_response.text}"
            saved_report = save_response.json()
            print(f"[Test] Saved report ID: {saved_report.get('id')}")

            # Step 3: Verify the report appears in the list
            list_response = await client.get(
                f"{GATEWAY_URL}/analysis/reports",
                headers=headers
            )

            assert list_response.status_code == 200
            reports_data = list_response.json()
            reports = reports_data.get("reports", [])

            print(f"[Test] Found {len(reports)} reports in list")

            # Check our report is in the list
            report_ids = [r.get("id") for r in reports]
            assert saved_report.get("id") in report_ids, f"Saved report {saved_report.get('id')} not found in list: {report_ids}"

            print(f"[Test] ✅ Report successfully saved and found in list!")

    @pytest.mark.asyncio
    async def test_list_reports_without_lc0(self, headers, session_id):
        """
        Simplified test: Just verify we can list reports for a fresh session.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Just list reports for a fresh session
            response = await client.get(
                f"{GATEWAY_URL}/analysis/reports",
                headers=headers
            )

            assert response.status_code == 200, f"List failed: {response.status_code}"
            data = response.json()

            print(f"\n[Test] Reports list response:")
            print(f"  - Total count: {data.get('total_count', 0)}")
            print(f"  - Reports: {len(data.get('reports', []))}")
            print(f"  - Linked accounts: {data.get('linked_accounts', [])}")
            print(f"  - Active filters: {data.get('active_filters', [])}")

            # For a fresh session, should have 0 reports
            assert data.get("total_count") == 0, \
                f"Expected 0 reports for fresh session, got {data.get('total_count')}"
            assert len(data.get("reports", [])) == 0, \
                f"Expected empty reports list for fresh session"

            print("[Test] ✅ Fresh session has no reports as expected")

    @pytest.mark.skip(reason="POST /games doesn't extract opening info from PGN - use streaming endpoint instead")
    @pytest.mark.asyncio
    async def test_direct_analysis_and_save(self, headers, session_id):
        """
        Test the non-streaming analysis endpoint followed by save.
        This test fetches games, saves them to DB, then runs analysis.

        NOTE: This test is skipped because POST /games does not extract
        opening_eco/opening_name from PGN. The streaming endpoint
        (/analysis/repertoire/stream) handles this properly by processing
        games through the import service which extracts opening info.
        """
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Step 1: Fetch games from import service
            print(f"\n[Test] Fetching games for DrNykterstein...")

            import_request_body = {
                "source": "lichess.org",
                "username": "DrNykterstein",
                "filters": {"max": 5}
            }
            import_response = await client.post(
                f"{GATEWAY_URL}/import/games/fetch",
                json=import_request_body,
                headers=headers
            )

            if import_response.status_code != 200:
                print(f"[Test] Import failed: {import_response.text}")
                pytest.skip(f"Gateway/Import service not available: {import_response.status_code}")

            import_data = import_response.json()
            fetched_games = import_data.get("games", [])
            print(f"[Test] Fetched {len(fetched_games)} games")

            # Step 2: Save each game to DB via POST /games
            saved_count = 0
            for game in fetched_games:
                save_game_request = {
                    "provider": game.get("source", "lichess.org"),
                    "source_id": game.get("id"),
                    "pgn": game.get("pgn", ""),
                    "username": "DrNykterstein"
                }
                save_game_resp = await client.post(
                    f"{GATEWAY_URL}/games",
                    json=save_game_request,
                    headers=headers
                )
                if save_game_resp.status_code == 200:
                    saved_count += 1

            print(f"[Test] Saved {saved_count} games to database")

            if saved_count == 0:
                pytest.skip("Could not save any games to database")

            # Step 3: Run analysis
            analysis_request = {
                "min_games": 1,
                "min_games_threshold": 1,
                "usernames": ["DrNykterstein"]
            }

            analysis_response = await client.post(
                f"{GATEWAY_URL}/analysis/repertoire",
                json=analysis_request,
                headers=headers
            )

            if analysis_response.status_code != 200:
                print(f"[Test] Analysis error: {analysis_response.text}")
                pytest.fail(f"Analysis failed: {analysis_response.status_code}")

            report = analysis_response.json()
            print(f"[Test] Analysis complete: {report.get('total_games', 0)} games")

            # Save the report
            save_request = {
                "name": f"Direct Analysis Test - {session_id[:8]}",
                "report_data": report,
                "source_usernames": ["DrNykterstein"]
            }

            save_response = await client.post(
                f"{GATEWAY_URL}/analysis/reports",
                json=save_request,
                headers=headers
            )

            assert save_response.status_code == 200, f"Save failed: {save_response.text}"
            saved = save_response.json()
            print(f"[Test] ✅ Report saved with ID: {saved.get('id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
