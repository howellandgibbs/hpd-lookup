import type {
  AddressLookupOptions,
  AddressLookupResult,
  BBLLookupResult,
  ParsedViolation,
  RawViolation,
  RequestOptions,
  ViolationLookupOptions,
} from './types.js';
import { HpdLookupError } from './errors.js';
import { fetchJson } from './http.js';
import { parseViolation } from './parse.js';
import { searchAddresses } from './geosearch.js';

/**
 * HPD Housing Maintenance Code Violations on NYC Open Data (Socrata).
 *
 * The dataset ID is pinned deliberately: Socrata IDs are stable, dataset
 * *names* are not.
 *
 * @see https://data.cityofnewyork.us/Housing-Development/Housing-Maintenance-Code-Violations/wvxf-dwi5
 */
export const SOCRATA_VIOLATIONS_URL = 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json';

/** Default number of violation records to request. */
export const DEFAULT_LIMIT = 1000;

/** Socrata's hard ceiling on `$limit` for a single request. */
export const MAX_LIMIT = 50_000;

/**
 * Fetch and parse every HPD violation recorded against a BBL.
 *
 * @param bbl - A 10-digit Borough-Block-Lot identifier.
 * @param options - Request, paging, and filter options.
 * @returns Parsed violations, newest inspection first.
 * @throws {HpdLookupError} On a malformed BBL or an upstream failure.
 *
 * @example
 * const { violations } = await lookupByBBL('1000160001', { classes: ['C'] });
 */
export async function lookupByBBL(
  bbl: string,
  options: ViolationLookupOptions = {},
): Promise<BBLLookupResult> {
  const cleanBBL = (bbl ?? '').trim();
  if (!/^\d{10}$/.test(cleanBBL)) {
    throw new HpdLookupError(`Expected a 10-digit BBL, received "${bbl}".`, { code: 'invalid_input' });
  }

  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const where = [`bbl='${cleanBBL}'`];
  if (options.since) where.push(`inspectiondate >= '${toSocrataDate(options.since)}'`);

  const url =
    `${SOCRATA_VIOLATIONS_URL}?$where=${encodeURIComponent(where.join(' AND '))}` +
    `&$order=${encodeURIComponent('inspectiondate DESC')}` +
    `&$limit=${limit}`;

  const data = await fetchJson<RawViolation[]>(url, options as RequestOptions);
  if (!Array.isArray(data)) {
    throw new HpdLookupError('The violations API returned an unexpected response shape.', {
      code: 'malformed_response',
      url,
    });
  }

  return { bbl: cleanBBL, violations: applyFilters(data.map(parseViolation), options) };
}

/**
 * Resolve a street address to a building, then fetch and parse its violations.
 *
 * The first GeoSearch match wins; the rest come back on `alternatives` so a UI
 * can offer a disambiguation step without a second request.
 *
 * @param address - A free-text NYC address.
 * @param options - Request, paging, and filter options.
 * @returns The resolved building and its parsed violations.
 * @throws {HpdLookupError} With code `address_not_found` when no candidate has
 *         a BBL, or on an upstream failure.
 *
 * @example
 * const { building, violations } = await lookupByAddress('100 Gold St, Manhattan');
 */
export async function lookupByAddress(
  address: string,
  options: AddressLookupOptions = {},
): Promise<AddressLookupResult> {
  const buildings = await searchAddresses(address, options);
  const building = buildings[0];

  if (!building) {
    throw new HpdLookupError(`No NYC building matched "${address}".`, { code: 'address_not_found' });
  }

  const { violations } = await lookupByBBL(building.bbl, options);

  return {
    bbl: building.bbl,
    building,
    alternatives: buildings.slice(1),
    violations,
  };
}

function applyFilters(violations: ParsedViolation[], options: ViolationLookupOptions): ParsedViolation[] {
  const states = options.states;
  const classes = options.classes;
  if (!states?.length && !classes?.length) return violations;

  return violations.filter((v) => {
    if (states?.length && !states.includes(v.status.state)) return false;
    if (classes?.length && (v.class === null || !classes.includes(v.class))) return false;
    return true;
  });
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new HpdLookupError(`\`limit\` must be a positive number, received ${limit}.`, {
      code: 'invalid_input',
    });
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/** Socrata floating timestamps have no zone suffix, so trim one if given. */
function toSocrataDate(since: string): string {
  const date = new Date(since);
  if (Number.isNaN(date.getTime())) {
    throw new HpdLookupError(`\`since\` must be a valid date, received "${since}".`, {
      code: 'invalid_input',
    });
  }
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}
