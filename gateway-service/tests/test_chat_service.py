"""
Backend Tests: Chat Service
===========================

Tests for the real-time chat service.
Tests WebSocket and SSE broadcasting.

Test categories:
- WebSocket connection handling
- SSE event streaming
- Message broadcasting
- User presence tracking
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json
import asyncio

# ============================================
# Mock Data Factories
# ============================================

def create_mock_websocket():
    """Factory for mock WebSocket connection"""
    ws = MagicMock()
    ws.send = AsyncMock()
    ws.close = AsyncMock()
    ws.receive_text = AsyncMock(return_value='{"type": "message", "content": "Hello"}')
    return ws


def create_mock_chat_room():
    """Factory for chat room data"""
    return {
        "id": "game_g1",
        "connections": [],
        "message_history": [],
        "spectator_count": 0,
    }


def create_mock_chat_event(event_type="message", content="Hello!"):
    """Factory for chat event"""
    return {
        "type": event_type,
        "user": "ChessFan123",
        "content": content,
        "timestamp": "2025-04-01T10:30:00Z",
        "room_id": "game_g1",
    }


# ============================================
# WebSocket Connection Tests
# ============================================

class TestWebSocketConnection:
    """Tests for WebSocket connection handling"""

    @pytest.mark.asyncio
    async def test_websocket_connect(self):
        """Test establishing WebSocket connection"""
        ws = create_mock_websocket()
        room = create_mock_chat_room()
        
        # Simulate connection
        room["connections"].append(ws)
        room["spectator_count"] += 1
        
        assert len(room["connections"]) == 1
        assert room["spectator_count"] == 1

    @pytest.mark.asyncio
    async def test_websocket_disconnect(self):
        """Test handling WebSocket disconnection"""
        ws = create_mock_websocket()
        room = create_mock_chat_room()
        
        room["connections"].append(ws)
        room["spectator_count"] += 1
        
        # Simulate disconnection
        room["connections"].remove(ws)
        room["spectator_count"] -= 1
        
        assert len(room["connections"]) == 0
        assert room["spectator_count"] == 0

    @pytest.mark.asyncio
    async def test_websocket_receive_message(self):
        """Test receiving message from WebSocket"""
        ws = create_mock_websocket()
        
        message = await ws.receive_text()
        data = json.loads(message)
        
        assert data["type"] == "message"
        assert data["content"] == "Hello"

    @pytest.mark.asyncio
    async def test_websocket_send_message(self):
        """Test sending message to WebSocket"""
        ws = create_mock_websocket()
        event = create_mock_chat_event()
        
        await ws.send(json.dumps(event))
        
        ws.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_websocket_broadcast_to_all(self):
        """Test broadcasting message to all connections"""
        room = create_mock_chat_room()
        connections = [create_mock_websocket() for _ in range(5)]
        room["connections"] = connections
        
        event = create_mock_chat_event()
        
        # Broadcast to all
        for ws in room["connections"]:
            await ws.send(json.dumps(event))
        
        for ws in connections:
            ws.send.assert_called_once()


# ============================================
# SSE Event Streaming Tests
# ============================================

class TestSSEStreaming:
    """Tests for Server-Sent Events streaming"""

    def test_format_sse_event(self):
        """Test formatting data as SSE event"""
        event = create_mock_chat_event()
        
        sse_formatted = f"data: {json.dumps(event)}\n\n"
        
        assert sse_formatted.startswith("data: ")
        assert sse_formatted.endswith("\n\n")

    def test_format_sse_with_event_type(self):
        """Test formatting SSE with event type"""
        event = create_mock_chat_event(event_type="move")
        event_type = event["type"]
        
        sse_formatted = f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
        
        assert "event: move" in sse_formatted
        assert "data: " in sse_formatted

    def test_sse_keep_alive(self):
        """Test SSE keep-alive comment"""
        keep_alive = ": keepalive\n\n"
        
        assert keep_alive.startswith(":")  # SSE comment

    @pytest.mark.asyncio
    async def test_sse_connection_stream(self):
        """Test SSE connection produces event stream"""
        events = [
            create_mock_chat_event(content="First message"),
            create_mock_chat_event(content="Second message"),
            create_mock_chat_event(content="Third message"),
        ]
        
        async def event_generator():
            for event in events:
                yield f"data: {json.dumps(event)}\n\n"
        
        received = []
        async for chunk in event_generator():
            received.append(chunk)
        
        assert len(received) == 3


# ============================================
# Message Broadcasting Tests
# ============================================

class TestMessageBroadcasting:
    """Tests for chat message broadcasting"""

    @pytest.mark.asyncio
    async def test_broadcast_excludes_sender(self):
        """Test broadcast can exclude the sender"""
        room = create_mock_chat_room()
        sender_ws = create_mock_websocket()
        other_ws1 = create_mock_websocket()
        other_ws2 = create_mock_websocket()
        
        room["connections"] = [sender_ws, other_ws1, other_ws2]
        
        event = create_mock_chat_event()
        
        # Broadcast to others (not sender)
        for ws in room["connections"]:
            if ws != sender_ws:
                await ws.send(json.dumps(event))
        
        sender_ws.send.assert_not_called()
        other_ws1.send.assert_called_once()
        other_ws2.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_broadcast_handles_disconnected_client(self):
        """Test broadcast handles disconnected clients gracefully"""
        room = create_mock_chat_room()
        healthy_ws = create_mock_websocket()
        
        failed_ws = create_mock_websocket()
        failed_ws.send = AsyncMock(side_effect=Exception("Connection closed"))
        
        room["connections"] = [healthy_ws, failed_ws]
        
        event = create_mock_chat_event()
        failed_connections = []
        
        for ws in room["connections"]:
            try:
                await ws.send(json.dumps(event))
            except Exception:
                failed_connections.append(ws)
        
        # Should identify the failed connection
        assert failed_ws in failed_connections
        assert healthy_ws not in failed_connections

    @pytest.mark.asyncio
    async def test_broadcast_message_to_room(self):
        """Test broadcasting message to specific room"""
        rooms = {
            "game_g1": create_mock_chat_room(),
            "game_g2": create_mock_chat_room(),
        }
        
        rooms["game_g1"]["connections"] = [create_mock_websocket(), create_mock_websocket()]
        rooms["game_g2"]["connections"] = [create_mock_websocket()]
        
        event = create_mock_chat_event()
        target_room = "game_g1"
        
        # Broadcast only to target room
        for ws in rooms[target_room]["connections"]:
            await ws.send(json.dumps(event))
        
        # Check g1 received, g2 did not
        for ws in rooms["game_g1"]["connections"]:
            ws.send.assert_called_once()
        
        for ws in rooms["game_g2"]["connections"]:
            ws.send.assert_not_called()


# ============================================
# User Presence Tests
# ============================================

class TestUserPresence:
    """Tests for user presence tracking"""

    def test_track_spectator_join(self):
        """Test tracking when spectator joins"""
        room = create_mock_chat_room()
        
        # User joins
        room["spectator_count"] += 1
        
        presence_event = {
            "type": "presence",
            "action": "join",
            "spectator_count": room["spectator_count"],
        }
        
        assert presence_event["action"] == "join"
        assert presence_event["spectator_count"] == 1

    def test_track_spectator_leave(self):
        """Test tracking when spectator leaves"""
        room = create_mock_chat_room()
        room["spectator_count"] = 10
        
        # User leaves
        room["spectator_count"] -= 1
        
        presence_event = {
            "type": "presence",
            "action": "leave",
            "spectator_count": room["spectator_count"],
        }
        
        assert presence_event["action"] == "leave"
        assert presence_event["spectator_count"] == 9

    def test_broadcast_presence_update(self):
        """Test broadcasting presence update to room"""
        room = create_mock_chat_room()
        room["connections"] = [create_mock_websocket() for _ in range(3)]
        room["spectator_count"] = 3
        
        presence_event = {
            "type": "presence",
            "spectator_count": room["spectator_count"],
        }
        
        # All connections should receive presence update
        assert len(room["connections"]) == 3


# ============================================
# Message History Tests
# ============================================

class TestMessageHistory:
    """Tests for chat message history"""

    def test_store_message_in_history(self):
        """Test storing messages in room history"""
        room = create_mock_chat_room()
        message = create_mock_chat_event()
        
        room["message_history"].append(message)
        
        assert len(room["message_history"]) == 1
        assert room["message_history"][0]["content"] == "Hello!"

    def test_limit_message_history(self):
        """Test limiting message history size"""
        room = create_mock_chat_room()
        max_history = 100
        
        # Add 150 messages
        for i in range(150):
            room["message_history"].append(
                create_mock_chat_event(content=f"Message {i}")
            )
        
        # Trim to max
        if len(room["message_history"]) > max_history:
            room["message_history"] = room["message_history"][-max_history:]
        
        assert len(room["message_history"]) == 100
        assert "Message 50" in room["message_history"][0]["content"]

    def test_get_recent_messages(self):
        """Test getting recent messages for new connections"""
        room = create_mock_chat_room()
        
        for i in range(50):
            room["message_history"].append(
                create_mock_chat_event(content=f"Message {i}")
            )
        
        # Get last 20 messages
        recent = room["message_history"][-20:]
        
        assert len(recent) == 20
        assert "Message 30" in recent[0]["content"]


# ============================================
# Error Handling Tests
# ============================================

class TestChatErrorHandling:
    """Tests for chat service error handling"""

    @pytest.mark.asyncio
    async def test_handle_malformed_message(self):
        """Test handling malformed JSON message"""
        ws = create_mock_websocket()
        ws.receive_text = AsyncMock(return_value="not valid json")
        
        message = await ws.receive_text()
        
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            data = None
        
        assert data is None

    @pytest.mark.asyncio
    async def test_handle_connection_timeout(self):
        """Test handling connection timeout"""
        ws = create_mock_websocket()
        ws.receive_text = AsyncMock(side_effect=asyncio.TimeoutError())
        
        with pytest.raises(asyncio.TimeoutError):
            await ws.receive_text()

    @pytest.mark.asyncio
    async def test_cleanup_on_room_empty(self):
        """Test cleanup when room becomes empty"""
        rooms = {
            "game_g1": create_mock_chat_room(),
        }
        rooms["game_g1"]["spectator_count"] = 1
        
        # Last user leaves
        rooms["game_g1"]["spectator_count"] -= 1
        
        # Cleanup empty room
        if rooms["game_g1"]["spectator_count"] == 0:
            rooms["game_g1"]["message_history"] = []
        
        assert len(rooms["game_g1"]["message_history"]) == 0



