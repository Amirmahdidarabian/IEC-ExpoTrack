/** Bound waiting without retrying writes: a timed-out write may already have committed. */
export async function boundedFetch(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetcher(input, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("The request timed out. Check the latest data before trying the action again."));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (timedOut) throw new Error("The request timed out. Check the latest data before trying the action again.");
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}
