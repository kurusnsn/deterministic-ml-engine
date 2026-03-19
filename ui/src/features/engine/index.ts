/**
 * Engine Module Index
 * 
 * Exports all engine-related functionality from a single entry point.
 */

// Store
export { useEngineSettingsStore, DEFAULT_ENGINE_DEPTH } from './engineSettingsStore';
export type { EngineMode } from './engineSettingsStore';

// Types
export type { EngineOptions, EngineResult, EngineClient } from './types';

// Clients
export { serverEngineClient, ServerEngineClient } from './ServerEngineClient';
export { wasmEngineClient, WasmEngineClient } from './WasmEngineClient';
export { unifiedEngineClient } from './UnifiedEngineClient';
