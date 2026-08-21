/**
 * `@howellandgibbs/hpd-lookup`
 *
 * Look up NYC HPD housing violations by address or BBL, and translate the
 * results out of code-speak into something a tenant can read.
 *
 * The parser is the point: HPD publishes violations as all-caps prose with the
 * legal citation glued to the front, so the raw data is technically public and
 * practically unreadable.
 *
 * @packageDocumentation
 */

export { lookupByAddress, lookupByBBL, SOCRATA_VIOLATIONS_URL, DEFAULT_LIMIT, MAX_LIMIT } from './violations.js';
export { searchAddresses, GEOSEARCH_URL, DEFAULT_MAX_SUGGESTIONS } from './geosearch.js';
export { parseViolation, cleanDescription, HPD_ACTION_VERBS, CITATION_WORDS, CLASS_SEVERITY } from './parse.js';
export type { CleanedDescription } from './parse.js';
export { translateStatus, STATUS_MAP, normalizeStatusKey } from './status.js';
export { toSentenceCase, PRESERVE_UPPERCASE } from './text.js';
export { formatAddress, ADDRESS_PRESERVE_UPPERCASE } from './address.js';
export { HpdLookupError, isHpdLookupError } from './errors.js';
export type { HpdErrorCode } from './errors.js';

export type {
  AddressLookupOptions,
  AddressLookupResult,
  BBLLookupResult,
  Building,
  ClassSeverity,
  ParsedViolation,
  RawViolation,
  RequestOptions,
  TranslatedStatus,
  ViolationClass,
  ViolationLookupOptions,
  ViolationState,
} from './types.js';
