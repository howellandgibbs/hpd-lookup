import type { AddressLookupOptions, Building, RequestOptions } from './types.js';
import { HpdLookupError } from './errors.js';
import { fetchJson } from './http.js';
import { formatAddress } from './address.js';

/**
 * NYC Planning Labs GeoSearch, the city's own geocoder. It is the only free
 * endpoint that returns a BBL for a street address, which is what every HPD
 * dataset keys on.
 *
 * @see https://geosearch.planninglabs.nyc/docs/
 */
export const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/autocomplete';

/** Default number of address candidates to request. */
export const DEFAULT_MAX_SUGGESTIONS = 5;

interface GeoSearchResponse {
  features?: GeoSearchFeature[];
}

interface GeoSearchFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    label?: string;
    name?: string;
    borough?: string;
    housenumber?: string;
    street?: string;
    postalcode?: string;
    addendum?: { pad?: { bbl?: string; bin?: string } };
  };
}

/**
 * Search NYC addresses and return the buildings that have a BBL.
 *
 * Candidates without a BBL — intersections, parks, some new construction —
 * are dropped, since nothing downstream can use them.
 *
 * @param address - A free-text address, e.g. "100 Gold St, Manhattan".
 * @param options - Request options; `maxSuggestions` caps the result count.
 * @returns Matching buildings, best match first. Empty when nothing matched.
 * @throws {HpdLookupError} On empty input or an upstream failure.
 *
 * @example
 * const [best] = await searchAddresses('100 Gold Street');
 * console.log(best?.bbl);
 */
export async function searchAddresses(
  address: string,
  options: AddressLookupOptions = {},
): Promise<Building[]> {
  const query = address?.trim();
  if (!query) {
    throw new HpdLookupError('An address is required.', { code: 'invalid_input' });
  }

  const size = options.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
  const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(query)}&size=${encodeURIComponent(String(size))}`;

  const data = await fetchJson<GeoSearchResponse>(url, options as RequestOptions);
  if (!data || !Array.isArray(data.features)) {
    throw new HpdLookupError('GeoSearch returned an unexpected response shape.', {
      code: 'malformed_response',
      url,
    });
  }

  return data.features.map(toBuilding).filter((b): b is Building => b !== null);
}

function toBuilding(feature: GeoSearchFeature): Building | null {
  const props = feature.properties ?? {};
  const pad = props.addendum?.pad ?? {};
  const bbl = pad.bbl?.trim();
  if (!bbl) return null;

  const coords = Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : null;
  const [lon, lat] = (coords ?? []) as unknown[];

  const label = props.label ?? props.name ?? 'Unknown address';

  return {
    bbl,
    bin: pad.bin?.trim() || null,
    label,
    displayLabel: formatAddress(label),
    borough: props.borough ?? null,
    houseNumber: props.housenumber ?? null,
    street: props.street ?? null,
    postalCode: props.postalcode ?? null,
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lon === 'number' ? lon : null,
  };
}
