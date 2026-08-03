import type { RequestOptions } from './types.js';
import { HpdLookupError } from './errors.js';

/** Default request timeout. Socrata occasionally hangs rather than erroring. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch JSON from an upstream API, normalizing every failure mode into an
 * {@link HpdLookupError}.
 *
 * @internal
 */
export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new HpdLookupError(
      'No fetch implementation available. Use Node 18+, or pass `fetch` in options.',
      { code: 'invalid_input' },
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs) : null;
  const unlink = linkSignal(options.signal, controller);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.appToken) headers['X-App-Token'] = options.appToken;

  try {
    const response = await doFetch(url, { headers, signal: controller.signal });

    if (!response.ok) {
      throw new HpdLookupError(
        `Upstream request failed with HTTP ${response.status}${
          response.status === 429 ? ' (rate limited — a Socrata app token raises the limit)' : ''
        }.`,
        { code: 'upstream_error', status: response.status, url },
      );
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new HpdLookupError('Upstream returned a response that is not valid JSON.', {
        code: 'malformed_response',
        status: response.status,
        url,
        cause,
      });
    }
  } catch (cause) {
    if (cause instanceof HpdLookupError) throw cause;
    if (isAbort(cause)) {
      const timedOut = controller.signal.aborted && !options.signal?.aborted;
      throw new HpdLookupError(
        timedOut ? `Request timed out after ${timeoutMs}ms.` : 'Request was aborted.',
        { code: 'aborted', url, cause },
      );
    }
    throw new HpdLookupError('Could not reach the upstream API.', {
      code: 'network_error',
      url,
      cause,
    });
  } finally {
    if (timer) clearTimeout(timer);
    unlink();
  }
}

/** Forward an external abort onto our internal controller. */
function linkSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function isAbort(value: unknown): boolean {
  return value instanceof Error && (value.name === 'AbortError' || value.name === 'TimeoutError');
}
