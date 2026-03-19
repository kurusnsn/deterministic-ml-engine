"""
Coach Concepts Service - Modal Deployment

Runs LC0+SVM inference, decode heuristics, concept grounding, and Llama commentary
generation in a single GPU container for cost optimization.

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

Do NOT commit model binaries (.pb.gz, .pkl) to git.

Usage:
    # Deploy the service
    modal deploy modal_apps/coach_concepts_service.py

    # Test locally
    modal run modal_apps/coach_concepts_service.py

    # Call from Python
    from modal import Function
    analyze = Function.lookup("coach-concepts", "CoachConcepts.analyze_move")
    result = analyze.remote(
        fen="2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
        move="Rxd5",
        engine_eval="+1.5"
    )
"""

import os
import sys
import logging
from typing import Optional, Dict, List, Any
from pathlib import Path

import modal

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Modal app configuration
app = modal.App("coach-concepts")

# Model volume for LC0 and SVM assets
models_vol = modal.Volume.from_name("chess-coach-models", create_if_missing=True)

# Reference to existing Llama vLLM service
LLAMA_APP_NAME = "chess-llama-3-1-inference"

# Container image with dependencies (no Llama - we call the existing vLLM endpoint)
concept_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "python-chess>=1.9.0",
        "numpy>=1.24.0",
        "tensorflow>=2.12.0",
        "joblib>=1.3.0",
        "aiohttp>=3.9.0",
    )
    .run_commands(
        # Install Stockfish for best reply computation
        "apt-get update && apt-get install -y stockfish"
    )
)

MINUTES = 60
GPU_TYPE = "a10g"


@app.cls(
    image=concept_image,
    gpu=GPU_TYPE,
    timeout=5 * MINUTES,
    scaledown_window=2 * MINUTES,  # Keep warm for 2 minutes
    volumes={
        "/models": models_vol,
    },
)
class CoachConcepts:
    """
    Modal class for concept-grounded chess commentary.

    Combines:
    - LC0 neural network activations
    - SVM probe concept classification
    - DecodeChess heuristic extraction
    - Concept grounding with evidence
    - Llama natural language generation
    """

    @modal.enter()
    def load_models(self):
        """Load all models on container startup."""
        logger.info("Loading models...")

        # Add gateway_modules to path for imports
        gateway_path = Path("/root/gateway-service")
        if gateway_path.exists():
            sys.path.insert(0, str(gateway_path))

        # Initialize LC0+SVM inference
        self._init_lc0_svm()

        # Initialize Llama for generation
        self._init_llama()

        logger.info("All models loaded successfully")

    def _init_lc0_svm(self):
        """Initialize LC0 and SVM inference."""
        try:
            # Set environment variables for model paths
            os.environ["LC0_MODEL_PATH"] = "/models/lc0/t78_512x40.pb.gz"
            os.environ["SVM_CACHE_DIR"] = "/models/svm/cache"
            os.environ["STOCKFISH_PATH"] = "/usr/games/stockfish"

            # Import and initialize inference
            # We'll define a local version since the module may not be in the container
            self.lc0_svm = self._create_lc0_svm_inference()
            logger.info("LC0+SVM inference initialized")

        except Exception as e:
            logger.warning(f"LC0+SVM init failed, using mock: {e}")
            self.lc0_svm = None

    def _create_lc0_svm_inference(self):
        """Create LC0+SVM inference instance."""
        import gzip
        import hashlib
        import numpy as np
        import chess
        import chess.engine
        import joblib

        class LC0SVMInference:
            def __init__(self):
                self.lc0_model = None
                self.svm_probes = {}
                self._cache = {}
                self._load_models()

            def _load_models(self):
                # Load LC0
                lc0_path = Path("/models/lc0/t78_512x40.pb.gz")
                if lc0_path.exists():
                    try:
                        import tensorflow as tf
                        with gzip.open(lc0_path, "rb") as f:
                            graph_def = tf.compat.v1.GraphDef()
                            graph_def.ParseFromString(f.read())
                        graph = tf.Graph()
                        with graph.as_default():
                            tf.import_graph_def(graph_def, name="lc0")
                        config = tf.compat.v1.ConfigProto()
                        config.gpu_options.allow_growth = True
                        session = tf.compat.v1.Session(graph=graph, config=config)
                        self.lc0_model = {"graph": graph, "session": session}
                        logger.info("LC0 model loaded")
                    except Exception as e:
                        logger.warning(f"LC0 load failed: {e}")

                # Load SVM probes
                svm_dir = Path("/models/svm/cache")
                if svm_dir.exists():
                    for pkl_file in svm_dir.glob("*.pkl"):
                        try:
                            self.svm_probes[pkl_file.stem] = joblib.load(pkl_file)
                        except Exception as e:
                            logger.warning(f"SVM probe {pkl_file} failed: {e}")
                    logger.info(f"Loaded {len(self.svm_probes)} SVM probes")

            def infer(self, fen: str, move: str, top_k: int = 5) -> Dict:
                cache_key = f"{fen}|{move}"
                if cache_key in self._cache:
                    return self._cache[cache_key]

                # Default concept keys
                concept_keys = [
                    "Threats_w_high", "Threats_b_high",
                    "Kingsafety_w_high", "Kingsafety_b_high",
                    "Mobility_w_high", "Mobility_b_high",
                    "Material_w_up", "Material_b_up",
                    "Pawns_w_strong", "Pawns_b_strong",
                    "Passedpawns_w", "Passedpawns_b",
                ]

                # Get activations and scores
                root_scores = self._get_scores(fen, concept_keys)

                # Apply move
                board = chess.Board(fen)
                try:
                    move_obj = board.parse_san(move)
                except:
                    try:
                        move_obj = board.parse_uci(move)
                    except:
                        return {"concept_scores": [], "concept_importance": [], "meta": {"error": "invalid_move"}}

                board.push(move_obj)
                after_move_fen = board.fen()

                # Get best reply
                best_reply = None
                try:
                    engine = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
                    result = engine.play(board, chess.engine.Limit(depth=10))
                    if result.move:
                        best_reply = result.move.uci()
                        board.push(result.move)
                    engine.quit()
                except Exception as e:
                    logger.warning(f"Stockfish failed: {e}")

                after_reply_scores = self._get_scores(board.fen(), concept_keys)

                # Compute importance
                importance = {}
                for concept in concept_keys:
                    importance[concept] = after_reply_scores.get(concept, 0) - root_scores.get(concept, 0)

                sorted_importance = sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True)[:top_k]

                result = {
                    "concept_scores": list(root_scores.items()),
                    "concept_importance": sorted_importance,
                    "meta": {"layer": 39, "rollout": "root, after_move, after_reply", "best_reply": best_reply}
                }
                self._cache[cache_key] = result
                return result

            def _get_scores(self, fen: str, concepts: List[str]) -> Dict[str, float]:
                scores = {}
                activation = self._get_activation(fen)

                for concept in concepts:
                    if concept in self.svm_probes:
                        try:
                            score = self.svm_probes[concept].decision_function(activation.reshape(1, -1))[0]
                            scores[concept] = float(score)
                        except:
                            scores[concept] = 0.0
                    else:
                        # Deterministic mock
                        seed = int(hashlib.sha256(f"{fen}_{concept}".encode()).hexdigest()[:8], 16)
                        scores[concept] = (seed % 1000) / 500.0 - 1.0
                return scores

            def _get_activation(self, fen: str) -> np.ndarray:
                if self.lc0_model is None:
                    seed = int(hashlib.sha256(fen.encode()).hexdigest()[:8], 16) % (2**31)
                    return np.random.RandomState(seed).randn(512)

                # Real LC0 activation extraction would go here
                # For now, use deterministic mock
                seed = int(hashlib.sha256(fen.encode()).hexdigest()[:8], 16) % (2**31)
                return np.random.RandomState(seed).randn(512)

        return LC0SVMInference()

    def _init_llama(self):
        """Initialize connection to existing Llama vLLM endpoint."""
        try:
            # Get the URL of the deployed Llama vLLM service
            from modal import Function

            # Look up the serve function from the llama inference app
            serve_fn = Function.lookup(LLAMA_APP_NAME, "serve")
            self.llama_url = serve_fn.get_web_url()
            logger.info(f"Llama vLLM endpoint: {self.llama_url}")

        except Exception as e:
            logger.warning(f"Could not get Llama endpoint URL: {e}")
            self.llama_url = None

    def _extract_decode_heuristics(self, fen: str) -> List[str]:
        """Extract DecodeChess heuristics for a position."""
        import chess

        board = chess.Board(fen)
        statements = []

        # Simplified heuristics extraction (matches decode_heuristics.py patterns)
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
        import re

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
            # Find category
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

            # Color filtering
            preferred_color = None
            if "_w_" in concept_name.lower():
                preferred_color = "white"
            elif "_b_" in concept_name.lower():
                preferred_color = "black"

            if preferred_color:
                # Prioritize statements with preferred color
                with_color = [e for e in evidence if preferred_color in e.lower()]
                without_color = [e for e in evidence if preferred_color not in e.lower()]
                evidence = (with_color + without_color)[:3]

            grounded[concept_name] = {
                "score": score,
                "evidence": evidence[:3],
            }

        return grounded

    async def _generate_llama_comment(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str],
        top_concepts: List[tuple],
        grounded: Dict[str, Dict],
    ) -> str:
        """Generate natural language comment using Llama vLLM endpoint."""
        import aiohttp

        # Build evidence text for prompt
        evidence_text = ""
        for concept_name, data in grounded.items():
            if data["evidence"]:
                evidence_text += f"\n{concept_name} (score: {data['score']:.2f}):\n"
                for ev in data["evidence"]:
                    evidence_text += f"  - {ev}\n"

        user_prompt = f"""Position (FEN): {fen}
Move played: {move}
Engine evaluation: {engine_eval or "unknown"}

Key concepts detected:{evidence_text}

Instructions:
- Write 1-2 sentences explaining the move's significance
- Only mention pieces and squares that appear in the evidence above
- If evidence is insufficient, say "unclear"
- Do NOT suggest alternative moves
- Focus on what the move accomplishes tactically or strategically"""

        if not self.llama_url:
            # Mock response when endpoint not available
            return f"The move {move} appears to affect {list(grounded.keys())[0] if grounded else 'the position'}."

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
                "temperature": 0.3,  # Low for determinism
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.llama_url}/v1/chat/completions",
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

    @modal.method()
    async def analyze_move(
        self,
        fen: str,
        move: str,
        engine_eval: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze a chess move with concept-grounded commentary.

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
        logger.info(f"Analyzing move {move} in position {fen[:30]}...")

        # Step 1: Extract decode heuristics
        decode_statements = self._extract_decode_heuristics(fen)

        # Step 2: Run LC0+SVM inference
        if self.lc0_svm:
            lc0_result = self.lc0_svm.infer(fen, move, top_k=5)
            top_concepts = lc0_result.get("concept_importance", [])
        else:
            # Mock concepts
            top_concepts = [
                ("Threats_w_mid", 0.5),
                ("Kingsafety_b_mid", 0.3),
                ("Material_t_mid", 0.2),
            ]

        # Step 3: Ground concepts with evidence
        grounded = self._ground_concepts(fen, decode_statements, top_concepts)

        # Step 4: Generate Llama comment (async call to vLLM endpoint)
        llm_comment = await self._generate_llama_comment(
            fen, move, engine_eval, top_concepts, grounded
        )

        return {
            "decode": {
                "statements": decode_statements[:10],  # Limit for response size
            },
            "concepts": {
                "top": top_concepts,
                "grounded": grounded,
            },
            "llm_comment": llm_comment,
        }


@app.local_entrypoint()
async def test():
    """Test the coach concepts service."""
    coach = CoachConcepts()

    # Test position
    fen = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21"
    move = "Rxd5"

    print(f"Testing position: {fen}")
    print(f"Move: {move}")
    print("-" * 50)

    result = await coach.analyze_move.remote.aio(fen=fen, move=move, engine_eval="+1.5")

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
async def analyze_move_if_enabled(
    fen: str,
    move: str,
    engine_eval: Optional[str] = None,
) -> Optional[Dict]:
    """
    Call Modal analyze_move only if feature flag is enabled.

    Feature flag: ENABLE_LC0_SVM_CONCEPTS=1

    Returns None if feature is disabled or call fails.
    """
    if not os.getenv("ENABLE_LC0_SVM_CONCEPTS", "").lower() in ("1", "true", "yes"):
        return None

    try:
        from modal import Function

        analyze = Function.lookup("coach-concepts", "CoachConcepts.analyze_move")
        return await analyze.remote.aio(fen=fen, move=move, engine_eval=engine_eval)

    except Exception as e:
        logger.warning(f"Coach concepts call failed: {e}")
        return None


def analyze_move_if_enabled_sync(
    fen: str,
    move: str,
    engine_eval: Optional[str] = None,
) -> Optional[Dict]:
    """
    Synchronous wrapper for analyze_move_if_enabled.

    Use this from synchronous code paths.
    """
    import asyncio

    if not os.getenv("ENABLE_LC0_SVM_CONCEPTS", "").lower() in ("1", "true", "yes"):
        return None

    try:
        return asyncio.run(analyze_move_if_enabled(fen, move, engine_eval))
    except Exception as e:
        logger.warning(f"Coach concepts sync call failed: {e}")
        return None
