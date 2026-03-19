"""
Unified Chess Inference Service - Modal Deployment

Runs vLLM (Llama 8B) on dedicated A10G GPU for LLM commentary.
LC0 + SVM runs on separate A10G GPU via lc0_service.py to avoid cuDNN conflicts.

Architecture (2 GPUs):
  ┌────────────────────────────────────┐  ┌──────────────────────────┐
  │  vLLM Service (A10G #1)            │  │ LC0 Service (A10G #2)    │
  │  ┌─────────────┐                   │  │ ┌──────────────┐         │
  │  │ vLLM Server │                   │  │ │ TensorFlow   │         │
  │  │ (Llama 8B)  │                   │  │ │ LC0 + SVM    │         │
  │  │ ~24GB VRAM  │                   │  │ │ ~4GB VRAM    │         │
  │  └─────────────┘                   │  │ └──────────────┘         │
  │  - Decode heuristics               │  │ - Activation extraction  │
  │  - Concept grounding               │  │ - SVM concept probes     │
  │  - LLM commentary                  │  │ - Delta concepts         │
  └────────────────────────────────────┘  └──────────────────────────┘
                      ↑ Remote calls ↑

Volume Setup Instructions:
    1. Create the Modal volume:
       modal volume create chess-coach-models

    2. Upload model assets (from repo-root/models directory):
       modal volume put chess-coach-models models/

       Expected local directory structure at <repo-root>/models/:
         models/
           lc0/
             t78_512x40.pb.gz
           svm/
             cache/
               linear_svm_v4.6_....pkl
               ... (other concept probes)

    3. Verify contents:
       modal volume ls chess-coach-models

Expected asset paths inside container:
    - /models/lc0/t78_512x40.pb.gz
    - /models/svm/cache/*.pkl

Usage:
    # Deploy the service
    modal deploy modal_apps/chess_inference_service.py

    # Test locally
    modal run modal_apps/chess_inference_service.py

    # Call from Python
    from modal import Function
    analyze = Function.lookup("unified-chess-inference", "ChessInference.analyze_move")
    result = analyze.remote(
        fen="2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
        move="Rxd5",
        engine_eval="+1.5"
    )

VERSION: 2.0 - LC0 integration fix (2025-12-20)
"""

import os
import sys
import time
import logging
import subprocess
from typing import Optional, Dict, List, Any, Annotated
from pathlib import Path
from pydantic import BaseModel
from fastapi import Body

import modal

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Modal app configuration
app = modal.App("unified-chess-inference")

# Model volumes
models_vol = modal.Volume.from_name("chess-coach-models", create_if_missing=True)
hf_cache_vol = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)

# Combined container image - vLLM only (LC0 runs in separate service)
unified_image = (
    modal.Image.from_registry(
        # Use CUDA image for vLLM
        "nvidia/cuda:12.4.1-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .env({
        "ENABLE_DELTA_TACTICS": "1",  # Enable delta tactical heuristics
        "ENABLE_DECODE_HEURISTICS": "1",  # Use grounded heuristics mode
        "ENABLE_WDL_ENTROPY": "0",  # WDL entropy (disabled by default)
    })
    .pip_install(
        # vLLM for Llama - pinned to avoid dependency issues
        "vllm==0.7.3",
        "huggingface_hub[hf_transfer]>=0.26",
        # Heuristics dependencies (no TensorFlow - LC0 is separate)
        "python-chess>=1.9.0",
        "numpy>=1.24.0",
        "aiohttp>=3.9.0",
    )
    .run_commands(
        # Install Stockfish for delta tactical heuristics
        "apt-get update && apt-get install -y stockfish"
    )
    # Add gateway-service code (for heuristics only - LC0 is separate service)
    .add_local_dir(
        "gateway-service/gateway_modules",
        remote_path="/root/gateway_modules",
        copy=True,
    )
    # NOTE: LC0 dependencies (lcztools, lczeroTraining, weights) removed
    # LC0 now runs in separate lc0-concept-service on its own GPU
)

# Model configuration
MODEL_NAME = "NousResearch/Hermes-3-Llama-3.1-8B"
VLLM_PORT = 8000
MINUTES = 60

# GPU: L40S has 48GB VRAM (A10G only has 24GB which is too small)
# A6000 is not available on Modal, L40S is the closest equivalent
GPU_TYPE = "l40s"

# Memory allocation: 80% for vLLM (~38GB), leaving ~10GB for LC0 + overhead
VLLM_GPU_MEMORY_UTILIZATION = 0.80


@app.cls(
    image=unified_image,
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    scaledown_window=2 * MINUTES,
    min_containers=0,  # Scale to zero when idle (saves ~$1K/month)
    volumes={
        "/models": models_vol,
        "/root/.cache/huggingface": hf_cache_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
)
class ChessInference:
    """
    Unified Modal class for chess analysis.

    Combines:
    - vLLM server for Llama 8B (runs as subprocess)
    - LC0 neural network activations
    - SVM probe concept classification
    - DecodeChess heuristic extraction
    - Concept grounding with evidence
    """

    @modal.enter()
    def load_models(self):
        """Load all models on container startup."""
        logger.info("=" * 60)
        logger.info("UNIFIED CHESS INFERENCE - Loading models...")
        logger.info("=" * 60)

        # Step 1: Connect to LC0 service (runs on separate A10G GPU)
        self._connect_lc0_service()

        # Step 2: Start vLLM server as subprocess (this GPU is vLLM-only)
        self._start_vllm_server()

        # Step 3: Wait for vLLM to be ready
        self._wait_for_vllm_ready()

        logger.info("=" * 60)
        logger.info("UNIFIED: service alive, vLLM warm")  # WARM INDICATOR
        logger.info("All models loaded successfully!")
        logger.info("=" * 60)
    
    def _connect_lc0_service(self):
        """Connect to the remote LC0 concept service."""
        logger.info("Connecting to LC0 concept service...")
        try:
            # Get handle to LC0 service running on separate GPU
            self.lc0_service = modal.Cls.lookup("lc0-concept-service", "LC0ConceptService")()
            logger.error("LC0 SERVICE CONNECTED: %s", self.lc0_service)  # DEBUG
        except Exception as e:
            logger.error(f"FAILED TO CONNECT TO LC0 SERVICE: {e}")  # DEBUG
            self.lc0_service = None

    def _start_vllm_server(self):
        """Start vLLM server as a background subprocess."""
        logger.info("Starting vLLM server...")

        cmd = [
            "vllm",
            "serve",
            "--uvicorn-log-level=warning",
            MODEL_NAME,
            "--served-model-name", "llm",
            "--host", "127.0.0.1",
            "--port", str(VLLM_PORT),
            "--max-model-len", "8192",  # Conservative for prod (protects from OOM)
            "--max-num-seqs", "4",  # Explicit concurrency limit (latency > throughput)
            "--gpu-memory-utilization", str(VLLM_GPU_MEMORY_UTILIZATION),
            "--enforce-eager",  # Faster startup, no CUDA graph compilation
        ]

        logger.info(f"vLLM command: {' '.join(cmd)}")

        # Start as subprocess (non-blocking)
        self.vllm_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        logger.info(f"vLLM server started with PID: {self.vllm_process.pid}")

    def _wait_for_vllm_ready(self, timeout_seconds: int = 600):
        """Wait for vLLM server to become ready (10 min timeout for cold start)."""
        import aiohttp
        import asyncio

        logger.info(f"Waiting for vLLM server to be ready (timeout: {timeout_seconds}s)...")
        start = time.time()
        last_log = start

        async def check_health():
            nonlocal last_log
            async with aiohttp.ClientSession() as session:
                while time.time() - start < timeout_seconds:
                    # Log vLLM output periodically
                    if hasattr(self, 'vllm_process') and self.vllm_process.stdout:
                        try:
                            import select
                            while select.select([self.vllm_process.stdout], [], [], 0)[0]:
                                line = self.vllm_process.stdout.readline()
                                if line:
                                    logger.info(f"[vLLM] {line.strip()}")
                        except:
                            pass

                    # Progress log every 30s
                    if time.time() - last_log > 30:
                        logger.info(f"Still waiting for vLLM... ({time.time() - start:.0f}s elapsed)")
                        last_log = time.time()

                    try:
                        async with session.get(
                            f"http://127.0.0.1:{VLLM_PORT}/health",
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as resp:
                            if resp.status == 200:
                                logger.info(f"vLLM ready after {time.time() - start:.1f}s")
                                return True
                    except Exception:
                        pass
                    await asyncio.sleep(3)
                return False

        ready = asyncio.get_event_loop().run_until_complete(check_health())
        if not ready:
            # Log any remaining vLLM output before failing
            if hasattr(self, 'vllm_process') and self.vllm_process.stdout:
                remaining = self.vllm_process.stdout.read()
                if remaining:
                    logger.error(f"[vLLM final output] {remaining}")
            logger.error("vLLM server failed to start within timeout!")
            raise RuntimeError("vLLM server startup timeout")

    # NOTE: _init_lc0_svm removed - LC0 now runs in separate lc0-concept-service
    # Use self.lc0_service.infer.remote() and self.lc0_service.infer_delta.remote() instead


    def _extract_decode_heuristics(self, fen: str) -> List[str]:
        """Extract DecodeChess heuristics for a position."""
        import chess

        board = chess.Board(fen)
        statements = []

        for sq in chess.SQUARES:
            piece = board.piece_at(sq)
            if not piece:
                continue

            piece_key = f"the {'white' if piece.color == chess.WHITE else 'black'} {chess.piece_name(piece.piece_type)} on {chess.square_name(sq)}"
            attacks = board.attacks(sq)

            for attacked_sq in attacks:
                target = board.piece_at(attacked_sq)
                if target:
                    target_color = "white" if target.color == chess.WHITE else "black"
                    target_name = chess.piece_name(target.piece_type)
                    target_sq = chess.square_name(attacked_sq)

                    if target.color != piece.color:
                        statements.append(f"{piece_key} threatens the {target_color} {target_name} on {target_sq}")
                        statements.append(f"{piece_key} can capture the {target_color} {target_name} on {target_sq}")
                    else:
                        statements.append(f"{piece_key} supports the {target_color} {target_name} on {target_sq}")

        return statements

    def _ground_concepts(
        self,
        fen: str,
        decode_statements: List[str],
        top_concepts: List[tuple],
    ) -> Dict[str, Dict]:
        """Ground concepts with evidence from decode statements."""

        CONCEPT_KEYWORDS = {
            "Threats": ["threatens", "is threatened", "can capture", "x-rays"],
            "Kingsafety": ["protects the king", "king on", "controls square f", "controls square g", "controls square h"],
            "Mobility": ["controls square", "uses file", "uses rank", "uses diagonal"],
            "Space": ["controls square", "uses file", "uses rank"],
            "Material": ["pawn", "capture", "can capture"],
            "Pawns": ["pawn", "supports"],
            "Passedpawns": ["passed pawn"],
        }

        grounded = {}
        statements_lower = [s.lower() for s in decode_statements]

        for concept_name, score in top_concepts:
            category = None
            for cat in CONCEPT_KEYWORDS:
                if concept_name.lower().startswith(cat.lower()):
                    category = cat
                    break

            evidence = []
            if category:
                keywords = CONCEPT_KEYWORDS[category]
                for i, stmt_lower in enumerate(statements_lower):
                    for kw in keywords:
                        if kw.lower() in stmt_lower:
                            evidence.append(decode_statements[i])
                            break
                    if len(evidence) >= 3:
                        break

            preferred_color = None
            if "_w_" in concept_name.lower():
                preferred_color = "white"
            elif "_b_" in concept_name.lower():
                preferred_color = "black"

            if preferred_color:
                with_color = [e for e in evidence if preferred_color in e.lower()]
                without_color = [e for e in evidence if preferred_color not in e.lower()]
                evidence = (with_color + without_color)[:3]

            grounded[concept_name] = {
                "score": score,
                "evidence": evidence[:3],
            }

        return grounded

    def _compute_wdl_entropy_if_available(
        self,
        fen: str,
        move: str,
    ) -> Optional[Dict]:
        """
        Compute WDL entropy delta using real LC0 value head.
        
        This is an OPTIONAL diagnostic signal, not an evaluation replacement.
        Returns None if WDL data is unavailable (graceful degradation).
        """
        try:
            # Call LC0 service to get real WDL entropy
            if self.lc0_service:
                result = self.lc0_service.infer_wdl_entropy.remote(fen=fen, move=move)
                
                if result and "entropy" in result and result["entropy"]:
                    logger.info(f"LC0 WDL entropy: {result['entropy']}")
                    return result["entropy"]
                elif result and "error" in result:
                    logger.debug(f"LC0 WDL entropy error: {result['error']}")
                    return None
            
            return None
            
        except Exception as e:
            logger.debug(f"WDL entropy unavailable: {e}")
            return None

    async def _generate_llama_comment(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str],
        top_concepts: List[tuple],
        grounded: Dict[str, Dict],
        delta_concepts: List[tuple] = None,  # NEW: concept deltas from move
        wdl_entropy: Optional[Dict] = None,  # NEW: WDL entropy (optional)
    ) -> str:
        """Generate natural language comment using LOCAL vLLM endpoint."""
        import aiohttp
        import chess

        delta_concepts = delta_concepts or []

        # Generate board state (ASCII representation)
        board = chess.Board(fen)
        board_ascii = str(board)
        
        # Check if we should use heuristics
        use_heuristics = os.environ.get("ENABLE_DECODE_HEURISTICS", "1") == "1"
        logger.info(f"LLM mode: {'heuristics' if use_heuristics else 'board_state+concepts'}")
        
        # Format delta concepts (always include if available)
        delta_text = ""
        if delta_concepts:
            delta_lines = []
            for name, delta in delta_concepts:
                direction = "improved" if delta > 0 else "reduced"
                delta_lines.append(f"  - {name}: {delta:+.1f} ({direction})")
            delta_text = "\n".join(delta_lines)
        
        if use_heuristics:
            # Original grounded evidence approach + delta concepts
            evidence_text = ""
            for concept_name, data in grounded.items():
                if data["evidence"]:
                    evidence_text += f"\n{concept_name} (score: {data['score']:.2f}):\n"
                    for ev in data["evidence"]:
                        evidence_text += f"  - {ev}\n"

            # Add entropy context if significant (only when enabled)
            entropy_context = ""
            if wdl_entropy and abs(wdl_entropy.get("delta", 0)) > 0.15:
                interpretation = wdl_entropy.get("interpretation", "")
                if "decisive" in interpretation:
                    entropy_context = "\nPosition clarity: This move clarifies the position, making the outcome more predictable."
                elif "uncertain" in interpretation:
                    entropy_context = "\nPosition clarity: This move creates complexity, making the outcome less certain."

            user_prompt = f"""Position (FEN): {fen}
Move played: {move}
Engine evaluation: {engine_eval or "unknown"}

Concept deltas (how this move changed the position):
{delta_text if delta_text else "  (no significant changes detected)"}

Key facts:{evidence_text}{entropy_context}

Write 1-2 sentences explaining this move. Only reference pieces and squares from the facts above. Do not suggest alternatives."""
        else:
            # Board state + concepts only (no heuristics)
            concepts_text = "\n".join([f"  - {name}: {score:.2f}" for name, score in top_concepts])
            
            logger.info(f"Board state prompt with {len(top_concepts)} concepts")
            
            user_prompt = f"""Current board position:
{board_ascii}

FEN: {fen}
Move played: {move}
Engine evaluation: {engine_eval or "unknown"}

Neural network concept scores (higher = more important):
{concepts_text}

Write 1-2 sentences explaining this move based on the board state. Verify piece positions before referencing them. Do not suggest alternatives."""

        try:
            messages = [
                {
                    "role": "system",
                    "content": "You are a chess coach providing concise, factual commentary. Be brief and precise."
                },
                {"role": "user", "content": user_prompt}
            ]

            payload = {
                "model": "llm",
                "messages": messages,
                "max_tokens": 150,
                "temperature": 0.3,
            }

            # Call LOCAL vLLM server (not external endpoint)
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"http://127.0.0.1:{VLLM_PORT}/v1/chat/completions",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        logger.warning(f"Llama API returned {resp.status}")
                        return f"The move {move} appears significant for the position."

                    result = await resp.json()
                    content = result["choices"][0]["message"]["content"]
                    return content.strip()[:500]

        except Exception as e:
            logger.warning(f"Llama generation failed: {e}")
            return f"The move {move} appears significant for the position."

    async def _analyze_move_impl(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Core implementation for move analysis.
        Called by both the Modal method and the HTTP endpoint.

        Args:
            fen: Position FEN before the move
            move: Move in SAN or UCI format
            engine_eval: Optional engine evaluation string (e.g., "+1.5")

        Returns:
            {
                "decode": { "statements": [...] },
                "concepts": { "top": [...], "grounded": {...} },
                "llm_comment": "..."
            }
        """
        import time
        t0 = time.time()  # Start total timing
        
        logger.info(f"Analyzing move {move} in position {fen[:30]}...")

        # =====================================================================
        # STAGE 1: Heuristics extraction (should be <20ms)
        # =====================================================================
        t_heur_start = time.time()
        
        decode_statements = self._extract_decode_heuristics(fen)
        
        # Step 1b: Add delta tactical heuristics if enabled
        if os.environ.get("ENABLE_DELTA_TACTICS") == "1":
            try:
                from gateway_modules.heuristics.delta_tactical_heuristics import extract_delta_tactical_heuristics
                delta_statements = extract_delta_tactical_heuristics(fen, move)
                decode_statements.extend(delta_statements[:6])  # Max 6 tactical statements
                logger.info(f"Added {len(delta_statements[:6])} delta tactical statements")
            except Exception as e:
                logger.warning(f"Delta tactical heuristics failed: {e}")
        
        t_heur_end = time.time()

        # =====================================================================
        # STAGE 2: LC0 + SVM inference (should be 100-300ms warm)
        # =====================================================================
        t_lc0_start = time.time()
        
        # DEBUG: Log lc0_service state at call time
        logger.error("LC0_SERVICE AT CALL TIME: %s (truthy=%s)", self.lc0_service, bool(self.lc0_service))
        
        if self.lc0_service:
            try:
                # FIX: Use .remote.aio() and await in async context
                lc0_result = await self.lc0_service.infer.remote.aio(
                    fen=fen,
                    move=move,
                    top_k=5
                )
                # DEBUG: Log result keys to verify proper resolution
                logger.error("LC0 RESULT KEYS: %s", lc0_result.keys() if isinstance(lc0_result, dict) else type(lc0_result))
                top_concepts = lc0_result.get("concept_importance", [])
            except Exception as e:
                logger.warning(f"LC0 inference failed: {e}")
                top_concepts = [
                    ("Threats_w_mid", 0.5),
                    ("Kingsafety_b_mid", 0.3),
                    ("Material_t_mid", 0.2),
                ]
        else:
            top_concepts = [
                ("Threats_w_mid", 0.5),
                ("Kingsafety_b_mid", 0.3),
                ("Material_t_mid", 0.2),
            ]

        # Step 2b: Get delta concepts (how move changed concept scores)
        delta_concepts = []
        if self.lc0_service:
            try:
                # FIX: Use .remote.aio() and await in async context
                delta_result = await self.lc0_service.infer_delta.remote.aio(
                    fen=fen,
                    move=move,
                    top_k=5
                )
                # DEBUG: Log result keys to verify proper resolution
                logger.error("DELTA RESULT KEYS: %s", delta_result.keys() if isinstance(delta_result, dict) else type(delta_result))
                delta_concepts = delta_result.get("deltas", [])
                logger.info(f"Delta concepts: {delta_concepts}")
            except Exception as e:
                logger.warning(f"Delta concepts failed: {e}")

        # Step 3: Ground concepts with evidence
        grounded = self._ground_concepts(fen, decode_statements, top_concepts)

        # Step 3b: WDL Entropy (optional, additive)
        wdl_entropy_result = None
        if os.getenv("ENABLE_WDL_ENTROPY", "0") == "1":
            wdl_entropy_result = self._compute_wdl_entropy_if_available(fen, move)
        
        t_lc0_end = time.time()

        # =====================================================================
        # STAGE 3: LLM generation (should be 600-1500ms warm)
        # =====================================================================
        t_llm_start = time.time()
        
        llm_comment = await self._generate_llama_comment(
            fen, move, engine_eval, top_concepts, grounded, delta_concepts,
            wdl_entropy=wdl_entropy_result,  # Pass entropy if available
        )
        
        t_llm_end = time.time()

        # =====================================================================
        # TIMING LOG (MANDATORY for latency debugging)
        # =====================================================================
        t3 = time.time()
        heur_ms = int((t_heur_end - t_heur_start) * 1000)
        lc0_ms = int((t_lc0_end - t_lc0_start) * 1000)
        llm_ms = int((t_llm_end - t_llm_start) * 1000)
        total_ms = int((t3 - t0) * 1000)
        
        logger.info(
            "TIMING ms | heur=%d | lc0=%d | llm=%d | total=%d",
            heur_ms, lc0_ms, llm_ms, total_ms
        )

        # Build response
        response = {
            "decode": {
                "statements": decode_statements[:10],
            },
            "concepts": {
                "top": top_concepts,
                "grounded": grounded,
                "deltas": delta_concepts,  # Include delta concepts in response
            },
            "llm_comment": llm_comment,
            # Include timing in response for debugging
            "_timing_ms": {
                "heur": heur_ms,
                "lc0": lc0_ms,
                "llm": llm_ms,
                "total": total_ms,
            },
        }
        
        # Add WDL entropy only if enabled and available (omit key otherwise)
        if wdl_entropy_result:
            response["wdl_entropy"] = wdl_entropy_result
        
        return response

    @modal.method()
    async def analyze_move(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Modal method wrapper for move analysis."""
        return await self._analyze_move_impl(fen=fen, move=move, engine_eval=engine_eval)

    @modal.method()
    def health_check(self) -> Dict[str, Any]:
        """Health check for the unified service."""
        return {
            "status": "healthy",
            "vllm_pid": self.vllm_process.pid if hasattr(self, 'vllm_process') else None,
            "lc0_service_connected": self.lc0_service is not None,
        }

    @modal.fastapi_endpoint(method="GET")
    def health_http(self) -> Dict[str, Any]:
        """HTTP health endpoint for testing connectivity."""
        return {"status": "ok", "service": "unified-chess-inference"}

    @modal.fastapi_endpoint(method="POST")
    async def analyze_move_http(
        self,
        request: Annotated[dict, Body(embed=False)]
    ) -> Dict[str, Any]:
        """
        HTTP endpoint for analyze_move.
        Called by gateway via UNIFIED_INFERENCE_URL.
        
        Body JSON: {"fen": "...", "move": "...", "engine_eval": "..."}
        """
        fen = request.get("fen", "")
        move = request.get("move", "")
        engine_eval = request.get("engine_eval")
        return await self._analyze_move_impl(fen=fen, move=move, engine_eval=engine_eval)

@app.local_entrypoint()
async def test():
    """Test the unified chess inference service."""
    inference = ChessInference()

    # Health check
    print("Running health check...")
    health = await inference.health_check.remote.aio()
    print(f"Health: {health}")

    # Test position - Italian Game
    fen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 1 5"
    move = "d4"  # Central strike

    print(f"\nTesting position: {fen}")
    print(f"Move: {move}")
    print("-" * 50)

    result = await inference.analyze_move.remote.aio(fen=fen, move=move, engine_eval="+1.5")

    print(f"Decode statements ({len(result['decode']['statements'])}):")
    for stmt in result["decode"]["statements"][:5]:
        print(f"  - {stmt}")

    print(f"\nTop concepts:")
    for concept, score in result["concepts"]["top"]:
        print(f"  - {concept}: {score:.3f}")

    print(f"\nGrounded evidence:")
    for concept, data in result["concepts"]["grounded"].items():
        print(f"  {concept}:")
        for ev in data["evidence"]:
            print(f"    - {ev}")

    print(f"\nLLM Comment:")
    print(f"  {result['llm_comment']}")


# Service wrapper for gateway integration
async def analyze_move_unified(
    fen: str,
    move: str,
    engine_eval: Optional[str] = None,
) -> Optional[Dict]:
    """
    Call the unified Modal service.

    Returns None if call fails.
    """
    try:
        from modal import Function

        analyze = Function.lookup("unified-chess-inference", "ChessInference.analyze_move")
        return await analyze.remote.aio(fen=fen, move=move, engine_eval=engine_eval)

    except Exception as e:
        logger.warning(f"Unified chess inference call failed: {e}")
        return None
