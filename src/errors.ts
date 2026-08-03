/** Why a lookup failed. */
export type HpdErrorCode =
  /** The upstream API answered with a non-2xx status. */
  | 'upstream_error'
  /** The request never completed: DNS, TLS, offline, CORS. */
  | 'network_error'
  /** The request was aborted, by the caller or by the timeout. */
  | 'aborted'
  /** The response parsed but was not the shape we expect. */
  | 'malformed_response'
  /** GeoSearch returned no building we could resolve to a BBL. */
  | 'address_not_found'
  /** The caller passed something we can reject before making a request. */
  | 'invalid_input';

/**
 * Every error this package throws is an `HpdLookupError`, so callers can catch
 * one type and switch on {@link HpdLookupError.code}.
 */
export class HpdLookupError extends Error {
  readonly code: HpdErrorCode;
  /** HTTP status, when the failure came from an upstream response. */
  readonly status: number | undefined;
  /** The URL we were requesting, with any app token removed. */
  readonly url: string | undefined;

  constructor(
    message: string,
    options: { code: HpdErrorCode; status?: number; url?: string; cause?: unknown },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'HpdLookupError';
    this.code = options.code;
    this.status = options.status;
    this.url = options.url;
  }
}

/**
 * Type guard for {@link HpdLookupError}, safe across duplicate installs of the
 * package where `instanceof` can fail.
 */
export function isHpdLookupError(value: unknown): value is HpdLookupError {
  return value instanceof Error && value.name === 'HpdLookupError' && 'code' in value;
}
