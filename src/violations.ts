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

/**
 * Records requested per page while paginating.
 *
 * Socrata will serve up to 50,000 in one response, but smaller pages keep each
 * request fast and let an explicit `limit` stop the fetch without downloading
 * far more than was asked for.
 */
export const PAGE_SIZE = 1000;

/**
 * Upper bound on records fetched across all pages. Only reached when no `limit`
 * is given; it exists so a pathological BBL cannot drive an unbounded run of
 * requests.
 */
export const MAX_LIMIT = 50_000;

/**
 * @deprecated Lookups now fetch every record by default, paginating as needed.
 * This constant no longer affects behaviour and is kept only so existing
 * imports keep compiling. Pass `limit` explicitly to cap a lookup.
 */
export const DEFAULT_LIMIT = 1000;

/**
 * Sort order for violation requests. `violationid` breaks ties within an
 * inspection date — without it, Socrata's order within a tie is unstable, and
 * paging with `$offset` duplicates some rows and silently skips others.
 * Measured on a 3,029-violation building: the date-only order dropped five.
 */
const ORDER = 'inspectiondate DESC, violationid DESC';

/**
 * Fetch and parse every HPD violation recorded against a BBL.
 *
 * Paginates automatically, so a building with thousands of violations comes
 * back complete rather than cut off at a page boundary. Pass `limit` to stop
 * early; `truncated` on the result then says whether more records exist.
 *
 * If any page fails, the whole lookup throws. A partial list returned as though
 * it were complete is the failure this function exists to prevent.
 *
 * @param bbl - A 10-digit Borough-Block-Lot identifier.
 * @param options - Request, paging, and filter options.
 * @returns Parsed violations newest inspection first, with the record count.
 * @throws {HpdLookupError} On a malformed BBL or an upstream failure.
 *
 * @example
 * const { violations, total } = await lookupByBBL('3016840001');
 * // total === 3029, violations.length === 3029
 */
export async function lookupByBBL(
  bbl: string,
  options: ViolationLookupOptions = {},
): Promise<BBLLookupResult> {
  const cleanBBL = (bbl ?? '').trim();
  if (!/^\d{10}$/.test(cleanBBL)) {
    throw new HpdLookupError(`Expected a 10-digit BBL, received "${bbl}".`, { code: 'invalid_input' });
  }

  const cap = options.limit === undefined ? MAX_LIMIT : clampLimit(options.limit);
  const where = [`bbl='${cleanBBL}'`];
  if (options.since) where.push(`inspectiondate >= '${toSocrataDate(options.since)}'`);
  const whereClause = encodeURIComponent(where.join(' AND '));

  const raw: RawViolation[] = [];
  let exhausted = false;

  while (raw.length < cap) {
    const pageLimit = Math.min(PAGE_SIZE, cap - raw.length);
    const url =
      `${SOCRATA_VIOLATIONS_URL}?$where=${whereClause}` +
      `&$order=${encodeURIComponent(ORDER)}` +
      `&$limit=${pageLimit}&$offset=${raw.length}`;

    const page = await fetchJson<RawViolation[]>(url, options as RequestOptions);
    if (!Array.isArray(page)) {
      throw new HpdLookupError('The violations API returned an unexpected response shape.', {
        code: 'malformed_response',
        url,
      });
    }

    raw.push(...page);
    // A short page means Socrata has nothing left to give.
    if (page.length < pageLimit) {
      exhausted = true;
      break;
    }
  }

  return {
    bbl: cleanBBL,
    violations: applyFilters(raw.map(parseViolation), options),
    total: raw.length,
    truncated: !exhausted,
  };
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

  const { violations, total, truncated } = await lookupByBBL(building.bbl, options);

  return {
    bbl: building.bbl,
    building,
    alternatives: buildings.slice(1),
    violations,
    total,
    truncated,
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
