"""
GPU Startup Time Benchmark

Measures and compares startup times for:
1. LC0 on A10G GPU (TensorFlow)
2. LLaMA 8B on L40S GPU (vLLM)

Run with: modal run benchmark_startup.py
"""

import modal
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = modal.App("benchmark-startup")

# ============================================================================
# LC0 Service Image (copy from lc0_service.py)
# ============================================================================

lc0_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .env({
        "TF_USE_LEGACY_KERAS": "1",
        "TF_CPP_MIN_LOG_LEVEL": "2",
    })
    .pip_install(
        "tensorflow[and-cuda]>=2.16.0,<2.17.0",
        "tf-keras>=2.16.0,<2.17.0",
        "python-chess>=1.9.0",
        "numpy>=1.24.0",
        "pyyaml>=6.0",
        "protobuf>=3.20.0",
        "joblib>=1.3.0",
        "scikit-learn>=1.3.0",
        "aiohttp>=3.9.0",
    )
    # Add lczeroTraining code (relative to project root)
    .add_local_dir(
        "../lczeroTraining",
        remote_path="/root/lczeroTraining",
        copy=True,
        ignore=["__pycache__/", "*.pyc"],
    )
    # Add lcztools for FEN conversion
    .add_local_dir(
        "../lcztools",
        remote_path="/root/lcztools",
        copy=True,
        ignore=["__pycache__/", "*.pyc"],
    )
    # Add LC0 weights
    .add_local_file(
        "../T78_512x40.pb.gz",
        remote_path="/root/lc0_weights/T78_512x40.pb.gz",
        copy=True,
    )
    # Add gateway modules for extraction
    .add_local_dir(
        "../gateway-service/gateway_modules",
        remote_path="/root/gateway_modules",
        copy=True,
        ignore=["__pycache__/", "*.pyc"],
    )
    .pip_install("grpcio-tools>=1.50.0")
    .run_commands(
        "mkdir -p /root/lczeroTraining/tf/proto && "
        "python -m grpc_tools.protoc "
        "-I=/root/lczeroTraining/libs/lczero-common/proto "
        "--python_out=/root/lczeroTraining/tf/proto "
        "/root/lczeroTraining/libs/lczero-common/proto/net.proto && "
        "touch /root/lczeroTraining/tf/proto/__init__.py"
    )
)

# ============================================================================
# LLaMA Service Image (copy from llm_commentary_service.py)
# ============================================================================

llm_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .pip_install(
        "vllm==0.7.3",
        "huggingface_hub[hf_transfer]>=0.26",
        "aiohttp>=3.9.0",
    )
)

# Volumes
models_vol = modal.Volume.from_name("chess-models", create_if_missing=True)
hf_cache_vol = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)

MODEL_NAME = "NousResearch/Hermes-3-Llama-3.1-8B"
VLLM_PORT = 8000


# ============================================================================
# LC0 Benchmark Service
# ============================================================================

@app.cls(
    image=lc0_image,
    gpu="A10G",
    volumes={"/models": models_vol},
    timeout=600,
)
class LC0Benchmark:
    """Benchmark LC0 GPU startup time."""
    
    @modal.enter()
    def load_models(self):
        """Load LC0 model and measure startup time."""
        import os
        
        self.startup_start = time.perf_counter()
        
        logger.info("=" * 60)
        logger.info("[LC0 BENCHMARK] Starting model load...")
        logger.info("=" * 60)
        
        # Set paths
        os.environ["LC0_CONFIG_PATH"] = "/root/lczeroTraining/tf/configs/T78.yaml"
        os.environ["LC0_WEIGHTS_PATH"] = "/root/lc0_weights/T78_512x40.pb.gz"
        os.environ["SVM_CACHE_DIR"] = "/models/svm"
        
        # Import and initialize LC0SVMInference
        from gateway_modules.concepts.lc0_svm_inference import LC0SVMInference
        
        self.lc0_svm = LC0SVMInference()
        
        # Force eager loading of models
        logger.info("[LC0 BENCHMARK] Forcing eager model load...")
        self.lc0_svm.load_models()
        
        self.startup_end = time.perf_counter()
        self.startup_time = self.startup_end - self.startup_start
        
        logger.info("=" * 60)
        logger.info(f"[LC0 BENCHMARK] Model loaded in {self.startup_time:.2f}s")
        logger.info("=" * 60)
    
    @modal.method()
    def get_startup_time(self):
        """Return the measured startup time."""
        return {
            "service": "LC0 (A10G GPU)",
            "startup_time_seconds": self.startup_time,
            "gpu_type": "A10G",
            "framework": "TensorFlow",
        }
    
    @modal.method()
    def test_inference(self, fen: str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", move: str = "e2e4"):
        """Test inference latency."""
        start = time.perf_counter()
        result = self.lc0_svm.infer(fen, move, top_k=5)
        end = time.perf_counter()
        
        return {
            "inference_time_ms": (end - start) * 1000,
            "result_keys": list(result.keys()) if isinstance(result, dict) else str(type(result)),
        }


# ============================================================================
# LLaMA Benchmark Service
# ============================================================================

@app.cls(
    image=llm_image,
    gpu="l40s",
    timeout=900,  # 15 mins for vLLM startup
    scaledown_window=300,
    min_containers=0,
    max_containers=1,
    volumes={
        "/root/.cache/huggingface": hf_cache_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
)
class LLaMABenchmark:
    """Benchmark LLaMA 8B (vLLM) GPU startup time."""
    
    @modal.enter()
    def start_vllm(self):
        """Start vLLM server and measure startup time."""
        import subprocess
        import asyncio
        import aiohttp
        
        self.startup_start = time.perf_counter()
        
        logger.info("=" * 60)
        logger.info("[LLAMA BENCHMARK] Starting vLLM...")
        logger.info("=" * 60)
        
        # Start vLLM as subprocess
        cmd = [
            "vllm",
            "serve",
            "--uvicorn-log-level=warning",
            MODEL_NAME,
            "--served-model-name", "llm",
            "--host", "127.0.0.1",
            "--port", str(VLLM_PORT),
            "--max-model-len", "8192",
            "--max-num-seqs", "4",
            "--gpu-memory-utilization", "0.85",
            "--enforce-eager",  # Faster startup
        ]
        
        logger.info(f"vLLM command: {' '.join(cmd)}")
        
        self.vllm_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        logger.info(f"vLLM process started with PID: {self.vllm_process.pid}")
        
        # Wait for vLLM to be ready
        self._wait_for_ready()
        
        self.startup_end = time.perf_counter()
        self.startup_time = self.startup_end - self.startup_start
        
        logger.info("=" * 60)
        logger.info(f"[LLAMA BENCHMARK] vLLM ready in {self.startup_time:.2f}s")
        logger.info("=" * 60)
    
    def _wait_for_ready(self, timeout_seconds: int = 600):
        """Wait for vLLM health endpoint to respond."""
        import aiohttp
        import asyncio
        
        start = time.time()
        
        async def check_health():
            async with aiohttp.ClientSession() as session:
                while time.time() - start < timeout_seconds:
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
            logger.error("vLLM failed to start within timeout!")
            raise RuntimeError("vLLM startup timeout")
    
    @modal.method()
    def get_startup_time(self):
        """Return the measured startup time."""
        return {
            "service": "LLaMA 8B (L40S GPU)",
            "startup_time_seconds": self.startup_time,
            "gpu_type": "L40S",
            "framework": "vLLM",
            "model": MODEL_NAME,
        }
    
    @modal.method()
    async def test_inference(self, prompt: str = "What is 1+1?"):
        """Test inference latency."""
        import aiohttp
        
        start = time.perf_counter()
        
        payload = {
            "model": "llm",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 50,
            "temperature": 0.3,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"http://127.0.0.1:{VLLM_PORT}/v1/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                result = await resp.json()
                
        end = time.perf_counter()
        
        return {
            "inference_time_ms": (end - start) * 1000,
            "response": result.get("choices", [{}])[0].get("message", {}).get("content", "")[:100],
        }


# ============================================================================
# Main Benchmark Entrypoint
# ============================================================================

@app.local_entrypoint()
def benchmark():
    """Run the GPU startup time benchmark."""
    print("=" * 70)
    print("GPU STARTUP TIME BENCHMARK")
    print("Comparing LC0 (TensorFlow/A10G) vs LLaMA 8B (vLLM/L40S)")
    print("=" * 70)
    print()
    
    # Benchmark LC0
    print("[1/2] Benchmarking LC0 on A10G GPU...")
    lc0_service = LC0Benchmark()
    
    lc0_start = time.perf_counter()
    lc0_result = lc0_service.get_startup_time.remote()
    lc0_total = time.perf_counter() - lc0_start
    
    print(f"  ✓ LC0 startup time (model load): {lc0_result['startup_time_seconds']:.2f}s")
    print(f"  ✓ Total cold start time: {lc0_total:.2f}s")
    
    # Test LC0 inference
    lc0_inference = lc0_service.test_inference.remote()
    print(f"  ✓ Inference latency: {lc0_inference['inference_time_ms']:.2f}ms")
    print()
    
    # Benchmark LLaMA
    print("[2/2] Benchmarking LLaMA 8B on L40S GPU...")
    llama_service = LLaMABenchmark()
    
    llama_start = time.perf_counter()
    llama_result = llama_service.get_startup_time.remote()
    llama_total = time.perf_counter() - llama_start
    
    print(f"  ✓ LLaMA startup time (vLLM): {llama_result['startup_time_seconds']:.2f}s")
    print(f"  ✓ Total cold start time: {llama_total:.2f}s")
    
    # Test LLaMA inference
    import asyncio
    llama_inference = asyncio.get_event_loop().run_until_complete(
        llama_service.test_inference.remote.aio("Explain 1.e4 in chess briefly.")
    )
    print(f"  ✓ Inference latency: {llama_inference['inference_time_ms']:.2f}ms")
    print(f"  ✓ Response preview: {llama_inference['response'][:50]}...")
    print()
    
    # Summary
    print("=" * 70)
    print("BENCHMARK RESULTS SUMMARY")
    print("=" * 70)
    print()
    print(f"{'Service':<30} {'Model Load (s)':<18} {'Cold Start (s)':<18}")
    print("-" * 70)
    print(f"{'LC0 (A10G GPU)':<30} {lc0_result['startup_time_seconds']:<18.2f} {lc0_total:<18.2f}")
    print(f"{'LLaMA 8B (L40S GPU)':<30} {llama_result['startup_time_seconds']:<18.2f} {llama_total:<18.2f}")
    print()
    
    lc0_faster = lc0_total < llama_total
    diff = abs(llama_total - lc0_total)
    
    if lc0_faster:
        print(f"✅ LC0 is FASTER by {diff:.2f}s ({diff/llama_total*100:.1f}%)")
        print()
        print("RECOMMENDATION: Use LC0 on GPU, use Groq API for LLaMA")
    else:
        print(f"✅ LLaMA is FASTER by {diff:.2f}s ({diff/lc0_total*100:.1f}%)")
        print()
        print("RECOMMENDATION: Use LLaMA on GPU, consider CPU/separate service for LC0")
    
    print()
    print("=" * 70)
    
    return {
        "lc0": lc0_result,
        "lc0_cold_start": lc0_total,
        "lc0_inference_ms": lc0_inference["inference_time_ms"],
        "llama": llama_result,
        "llama_cold_start": llama_total,
        "llama_inference_ms": llama_inference["inference_time_ms"],
        "recommendation": "lc0_gpu_groq_api" if lc0_faster else "llama_gpu_lc0_separate",
    }
