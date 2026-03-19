# Architecture

## Data Flow Diagram

```text
[ Web Client / Board Viewer ]
      |
      | (SSE / HTTP)
      v
[ Evaluation Gateway ] ------> [ Local WASM Engine (Deterministic) ]
      |
      +---> [ Concept Probe Engine (Stubbed) ]
      |
      v
[ Probabilistic Generative Layer ] (Modal Serverless)
      |
      +---> [ LLM Commentary Node ]
```

## Deterministic vs. Probabilistic Separation

This system aggressively partitions hard logical bounds from contextual fuzziness:
1. **Deterministic Core:** The browser Web Worker or the backend C++ engine processes exact node evaluations (Centipawns, Mate bounds). These outputs are strictly typed and immutable.
2. **ML/Probabilistic Layer:** Custom LC0 probing or structural heuristics (the `ConceptProbeEngine`) evaluate the *nature* of the position (e.g. "complex middlegame", "cramped"). 

This separation prevents the LLM from hallucinating legal moves or evaluation scores—it merely translates the deterministic state into human-readable commentary.

## Scaling Strategy
The state traversal DAG runs in-memory on the Gateway, scaling horizontally via Redis PubSub if needed. The heavy Generative Layer is deployed to serverless workers (like Modal) to scale purely on request volume independently of persistent gateway sockets.
