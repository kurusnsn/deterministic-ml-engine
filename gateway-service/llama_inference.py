"""
Modal deployment for Meta Llama 3.1 8B Instruct with vLLM
This serves the model via OpenAI-compatible API at /v1/chat/completions
"""
import json
import time
from datetime import datetime, timezone
from typing import Any

import aiohttp
import modal

# Container image with vLLM prerelease and nightly PyTorch
vllm_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .pip_install(
        "vllm>=0.7.0",
        "huggingface_hub[hf_transfer]>=0.26",
    )
)

# Model configuration - Hermes 3 Llama 3.1 8B (ungated)
MODEL_NAME = "NousResearch/Hermes-3-Llama-3.1-8B"
MODEL_REVISION = None  # Use latest version

# Cache volumes for model weights and vLLM artifacts
hf_cache_vol = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)

# Configuration: DEV vs PROD
# DEV: FAST_BOOT=True, A10G, 1min scaledown (cost-optimized, frequent cold starts)
# PROD: FAST_BOOT=False, A100, 15min scaledown (performance-optimized, minimal cold starts)

# Compilation settings
FAST_BOOT = True  # True = faster cold starts, slightly slower inference (good for dev)

# Concurrency settings
MAX_INPUTS = 32  # how many requests can one replica handle?
CUDA_GRAPH_CAPTURE_SIZES = [  # 1, 2, 4, ... MAX_INPUTS
    1 << i for i in range((MAX_INPUTS).bit_length())
]

app = modal.App("chess-llama-3-1-inference")

N_GPU = 1  # Llama 3.1 8B can run on 1 GPU
MINUTES = 60  # seconds
VLLM_PORT = 8000


@app.function(
    image=vllm_image,
    gpu=f"A10G:{N_GPU}",  # A10G: cost-effective for dev (24GB VRAM, ~68% cheaper than A100)
    scaledown_window=1 * MINUTES,  # Shut down after 1 min idle (dev cost optimization)
    timeout=5 * MINUTES,  # Shorter timeout for dev
    volumes={
        "/root/.cache/huggingface": hf_cache_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
)
@modal.concurrent(max_inputs=MAX_INPUTS)
@modal.web_server(port=VLLM_PORT, startup_timeout=30 * MINUTES)
def serve():
    import subprocess

    cmd = [
        "vllm",
        "serve",
        "--uvicorn-log-level=info",
        MODEL_NAME,
        "--served-model-name",
        "llm",  # This is the model name to use in API requests
        "--host",
        "0.0.0.0",
        "--port",
        str(VLLM_PORT),
        "--max-model-len",
        "30000",  # Limit context to 30K tokens to fit in A10G memory (24GB VRAM)
        "--gpu-memory-utilization",
        "0.95",  # Use 95% of GPU memory (default is 0.9)
    ]

    # Add revision if specified
    if MODEL_REVISION:
        cmd.extend(["--revision", MODEL_REVISION])

    # enforce-eager disables both Torch compilation and CUDA graph capture
    # default is no-enforce-eager. see the --compilation-config flag for tighter control
    cmd += ["--enforce-eager" if FAST_BOOT else "--no-enforce-eager"]

    if not FAST_BOOT:  # CUDA graph capture is only used without `--enforce-eager`
        cmd += [
            "-O.cudagraph_capture_sizes="
            + str(CUDA_GRAPH_CAPTURE_SIZES).replace(" ", "")
        ]

    # assume multiple GPUs are for splitting up large matrix multiplications
    cmd += ["--tensor-parallel-size", str(N_GPU)]

    print(f"Starting vLLM server with command: {' '.join(cmd)}")

    subprocess.Popen(" ".join(cmd), shell=True)


@app.local_entrypoint()
async def test(test_timeout=30 * MINUTES, user_content=None, twice=True):
    """
    Test the deployed Llama 3.1 8B endpoint with a chess-related query
    Run with: modal run gateway-service/llama_inference.py
    """
    url = serve.get_web_url()

    # Chess-optimized system prompt
    system_prompt = {
        "role": "system",
        "content": f"""You are a chess analysis AI assistant.
        Knowledge cutoff: 2024-06
        Current date: {datetime.now(timezone.utc).date()}
        Reasoning: low
        # Valid channels: analysis, commentary, final. Channel must be included for every message.
        Provide clear, tactical chess analysis based on position evaluation and engine data.""",
    }

    if user_content is None:
        user_content = "Analyze the opening move 1.e4 in chess. What are its strategic benefits?"

    messages = [  # OpenAI chat format
        system_prompt,
        {"role": "user", "content": user_content},
    ]

    async with aiohttp.ClientSession(base_url=url) as session:
        print(f"Running health check for server at {url}")
        async with session.get("/health", timeout=test_timeout - 1 * MINUTES) as resp:
            up = resp.status == 200
        assert up, f"Failed health check for server at {url}"
        print(f"✓ Successful health check for server at {url}")

        print(f"Sending chess analysis request to {url}:")
        print(f"  User: {user_content}")
        await _send_request(session, "llm", messages)

        if twice:
            messages.append({
                "role": "user",
                "content": "Now explain the Sicilian Defense response 1...c5"
            })
            print(f"\nSending follow-up request to {url}")
            await _send_request(session, "llm", messages)


async def _send_request(
    session: aiohttp.ClientSession, model: str, messages: list
) -> None:
    # `stream=True` tells an OpenAI-compatible backend to stream chunks
    payload: dict[str, Any] = {"messages": messages, "model": model, "stream": True}

    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}

    t = time.perf_counter()
    async with session.post(
        "/v1/chat/completions", json=payload, headers=headers, timeout=10 * MINUTES
    ) as resp:
        async for raw in resp.content:
            resp.raise_for_status()
            # extract new content and stream it
            line = raw.decode().strip()
            if not line or line == "data: [DONE]":
                continue
            if line.startswith("data: "):  # SSE prefix
                line = line[len("data: ") :]

            chunk = json.loads(line)
            assert (
                chunk["object"] == "chat.completion.chunk"
            )  # or something went horribly wrong
            delta = chunk["choices"][0]["delta"]

            if "content" in delta:
                print(delta["content"], end="")  # print the content as it comes in
            elif "reasoning_content" in delta:
                print(delta["reasoning_content"], end="")
            else:
                raise ValueError(f"Unsupported response delta: {delta}")
    print("")
    print(f"Time to Last Token: {time.perf_counter() - t:.2f} seconds")
