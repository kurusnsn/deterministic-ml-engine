/**
 * LLM Analysis Queue Manager
 * Handles sequential processing of LLM analysis requests to prevent message skipping
 */

export interface AnalysisRequest {
    id: string;
    movePath: string;
    moveSan: string;
    fenBeforeMove: string;
    currentFen: string;
    moveFrom: string;
    moveTo: string;
    movePromotion?: string;
    moveHistory: string[];
    abortController: AbortController;
}

export class LLMAnalysisQueue {
    private queue: AnalysisRequest[] = [];
    private processing = false;
    private readonly MAX_QUEUE_SIZE = 10;

    /**
     * Add a request to the queue
     * If queue is full, removes oldest request
     */
    enqueue(request: AnalysisRequest): boolean {
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            console.warn('[LLMQueue] Queue full, dropping oldest request');
            const dropped = this.queue.shift();
            if (dropped) {
                dropped.abortController.abort();
            }
        }
        this.queue.push(request);
        console.log(`[LLMQueue] Enqueued ${request.moveSan} (queue size: ${this.queue.length})`);
        return true;
    }

    /**
     * Remove and return the next request from the queue
     */
    dequeue(): AnalysisRequest | null {
        const request = this.queue.shift() || null;
        if (request) {
            console.log(`[LLMQueue] Dequeued ${request.moveSan} (remaining: ${this.queue.length})`);
        }
        return request;
    }

    /**
     * Abort a specific request by ID
     */
    abort(requestId: string): void {
        const request = this.queue.find(r => r.id === requestId);
        if (request) {
            console.log(`[LLMQueue] Aborting request ${requestId}`);
            request.abortController.abort();
            this.queue = this.queue.filter(r => r.id !== requestId);
        }
    }

    /**
     * Abort all pending requests and clear the queue
     */
    abortAll(): void {
        console.log(`[LLMQueue] Aborting all ${this.queue.length} pending requests`);
        this.queue.forEach(r => {
            try {
                r.abortController.abort();
            } catch (e) {
                // Ignore abort errors
            }
        });
        this.queue = [];
        this.processing = false;
    }

    /**
     * Get the current queue size
     */
    getQueueSize(): number {
        return this.queue.length;
    }

    /**
     * Check if queue is currently processing
     */
    isProcessing(): boolean {
        return this.processing;
    }

    /**
     * Set processing state
     */
    setProcessing(value: boolean): void {
        this.processing = value;
    }

    /**
     * Get all pending move SANs (for UI display)
     */
    getPendingMoves(): string[] {
        return this.queue.map(r => r.moveSan);
    }

    /**
     * Clear the queue without aborting (for cleanup)
     */
    clear(): void {
        this.queue = [];
        this.processing = false;
    }
}
