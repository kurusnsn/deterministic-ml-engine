/**
 * WebGPU Detection Utility
 *
 * This utility checks for WebGPU support in the browser.
 * WebGPU can be used for high-performance computing tasks like:
 * - Running ONNX models for chess analysis
 * - Accelerated neural network inference
 * - GPU-accelerated move evaluation
 */

export interface WebGPUSupport {
  isSupported: boolean;
  adapter: GPUAdapter | null;
  errorMessage?: string;
}

/**
 * Check if the browser supports WebGPU
 * @returns Promise<WebGPUSupport> - Support information
 */
export async function checkWebGPUSupport(): Promise<WebGPUSupport> {
  // Check if running in browser
  if (typeof window === 'undefined') {
    return {
      isSupported: false,
      adapter: null,
      errorMessage: 'Not running in browser environment'
    };
  }

  // Check if navigator.gpu is available
  if (!('gpu' in navigator)) {
    return {
      isSupported: false,
      adapter: null,
      errorMessage: 'WebGPU is not available in this browser'
    };
  }

  try {
    // Try to request a GPU adapter
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return {
        isSupported: false,
        adapter: null,
        errorMessage: 'No WebGPU adapter available'
      };
    }

    return {
      isSupported: true,
      adapter: adapter
    };
  } catch (error) {
    return {
      isSupported: false,
      adapter: null,
      errorMessage: error instanceof Error ? error.message : 'Unknown error requesting WebGPU adapter'
    };
  }
}

/**
 * Synchronous check for basic WebGPU availability
 * Note: This doesn't check if an adapter can be acquired
 * @returns boolean - True if navigator.gpu exists
 */
export function hasWebGPUAPI(): boolean {
  if (typeof window === 'undefined') return false;
  return 'gpu' in navigator;
}

/**
 * Get human-readable browser compatibility message
 * @returns string - Compatibility message
 */
export function getWebGPUCompatibilityMessage(): string {
  if (!hasWebGPUAPI()) {
    return 'WebGPU is not supported in your browser. Consider using Chrome 113+, Edge 113+, or other Chromium-based browsers.';
  }
  return 'WebGPU API detected. Checking for adapter availability...';
}
