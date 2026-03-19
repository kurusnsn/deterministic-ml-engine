# System Design

## Trade-Offs

- **Client-Side vs Server-Side Compute**: Running deterministic tree searches (Stockfish WASM) locally in the client browser drastically reduces backend CPU load, but creates discrepancies in search depths across lower-end hardware. The backend service validates key nodes lazily or triggers full evaluations when probabilistic ML annotations are required.
- **Microservice Isolation**: The UI, the API Gateway, and the LLM workers are separated intentionally. State traversal requires low-latency websocket persistence, whereas LLM text generation is inherently high-latency. The API Gateway orchestrates these bounds.

## Known Bottlenecks (Mitigated)
- **Websocket Saturation**: Thousands of parallel game analyses can saturate standard connection limits. Mitigation involves stateless re-hydration logic where a dropped client can request a differential update rather than a full tree replay.
- **Probe Latency**: Evaluating every single position node through a dense SVM model is prohibitively expensive. We mitigate this using localized caching and delta-state heuristics, firing full probes only at decisive material or positional transitions.
