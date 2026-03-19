export type NdjsonOptions = {
  signal?: AbortSignal;
  onError?: (error: unknown, line: string) => void;
};

function getReader(input: Response | ReadableStream<Uint8Array>) {
  const stream = input instanceof Response ? input.body : input;
  if (!stream) throw new Error("NDJSON: missing ReadableStream body");
  return stream.getReader();
}

async function readLoop(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => void,
  options?: NdjsonOptions
) {
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      if (options?.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onLine(line);
      }
    }
    const tail = buf.trim();
    if (tail) onLine(tail);
  } finally {
    try { await reader.cancel(); } catch {}
  }
}

export async function consumeNdjson(
  input: Response | ReadableStream<Uint8Array>,
  onItem: (item: unknown) => void,
  options?: NdjsonOptions
): Promise<void> {
  const reader = getReader(input);
  await readLoop(reader, (line) => {
    try {
      const obj = JSON.parse(line);
      onItem(obj);
    } catch (e) {
      options?.onError?.(e, line);
    }
  }, options);
}

export async function* streamNdjson(
  input: Response | ReadableStream<Uint8Array>,
  options?: NdjsonOptions
): AsyncGenerator<unknown> {
  const reader = getReader(input);
  const queue: unknown[] = [];
  let resolveNext: ((v: IteratorResult<unknown>) => void) | null = null;

  const push = (item: unknown) => {
    if (resolveNext) {
      const r = resolveNext; resolveNext = null;
      r({ value: item, done: false });
    } else {
      queue.push(item);
    }
  };

  const loop = readLoop(reader, (line) => {
    try { push(JSON.parse(line)); }
    catch (e) { options?.onError?.(e, line); }
  }, options).then(() => {
    if (resolveNext) { const r = resolveNext; resolveNext = null; r({ value: undefined, done: true }); }
  });

  try {
    // iterator protocol pull
    while (true) {
      if (queue.length) {
        yield queue.shift() as unknown;
        continue;
      }
      const next = await new Promise<IteratorResult<unknown>>((res) => { resolveNext = res; });
      if (next.done) return;
      yield next.value as unknown;
    }
  } finally {
    try { await loop; } catch {}
  }
}

