import { describe, expect, it, vi } from 'vitest';
import { lookupByAddress, lookupByBBL } from '../src/violations.js';
import { searchAddresses } from '../src/geosearch.js';
import { HpdLookupError, isHpdLookupError } from '../src/errors.js';
import type { RawViolation } from '../src/types.js';

const GEO_RESPONSE = {
  features: [
    {
      geometry: { coordinates: [-73.9857, 40.7484] },
      properties: {
        label: '100 GOLD STREET, Manhattan, NY, USA',
        borough: 'Manhattan',
        housenumber: '100',
        street: 'GOLD STREET',
        postalcode: '10038',
        addendum: { pad: { bbl: '1000160001', bin: '1001234' } },
      },
    },
    {
      properties: {
        label: '100 GOLD STREET, Brooklyn, NY, USA',
        addendum: { pad: { bbl: '3000160001' } },
      },
    },
    // No BBL — an intersection or a park. Should be dropped.
    { properties: { label: 'GOLD STREET AND FRANKFORT STREET' } },
  ],
};

const VIOLATIONS: RawViolation[] = [
  {
    violationid: '1',
    novdescription: '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER',
    currentstatus: 'VIOLATION OPEN',
    violationstatus: 'Open',
    class: 'C',
    inspectiondate: '2026-08-02T00:00:00.000',
  },
  {
    violationid: '2',
    novdescription: '§ 27-2005 ADM CODE PAINT THE CEILING',
    currentstatus: 'VIOLATION CLOSED',
    violationstatus: 'Close',
    class: 'A',
    inspectiondate: '2025-01-15T00:00:00.000',
  },
];

/** Route requests by hostname so tests never depend on exact query strings. */
function mockFetch(overrides: { geo?: unknown; violations?: unknown; status?: number } = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    const body = href.includes('geosearch')
      ? overrides.geo ?? GEO_RESPONSE
      : overrides.violations ?? VIOLATIONS;
    const status = overrides.status ?? 200;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
}

describe('searchAddresses', () => {
  it('returns only candidates that have a BBL', async () => {
    const buildings = await searchAddresses('100 Gold St', { fetch: mockFetch() });
    expect(buildings).toHaveLength(2);
    expect(buildings[0]).toMatchObject({
      bbl: '1000160001',
      bin: '1001234',
      borough: 'Manhattan',
      latitude: 40.7484,
      longitude: -73.9857,
    });
    expect(buildings[1]?.bin).toBeNull();
  });

  it('rejects an empty address before making a request', async () => {
    const fetchSpy = mockFetch();
    await expect(searchAddresses('  ', { fetch: fetchSpy })).rejects.toThrow(HpdLookupError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the app token when one is provided', async () => {
    const fetchSpy = mockFetch();
    await searchAddresses('100 Gold St', { fetch: fetchSpy, appToken: 'test-token' });
    const [, init] = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ 'X-App-Token': 'test-token' });
  });
});

describe('lookupByBBL', () => {
  it('parses every violation it fetches', async () => {
    const { bbl, violations } = await lookupByBBL('1000160001', { fetch: mockFetch() });
    expect(bbl).toBe('1000160001');
    expect(violations).toHaveLength(2);
    expect(violations[0]?.description).toBe('Repair the broken plaster');
    expect(violations[0]?.severity).toBe('Immediately hazardous');
  });

  it('filters by state', async () => {
    const { violations } = await lookupByBBL('1000160001', { fetch: mockFetch(), states: ['open'] });
    expect(violations.map((v) => v.id)).toEqual(['1']);
  });

  it('filters by class', async () => {
    const { violations } = await lookupByBBL('1000160001', { fetch: mockFetch(), classes: ['A'] });
    expect(violations.map((v) => v.id)).toEqual(['2']);
  });

  it('rejects a malformed BBL before making a request', async () => {
    const fetchSpy = mockFetch();
    await expect(lookupByBBL('not-a-bbl', { fetch: fetchSpy })).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports upstream failures with the HTTP status attached', async () => {
    const error = await lookupByBBL('1000160001', { fetch: mockFetch({ status: 503 }) }).catch((e) => e);
    expect(isHpdLookupError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'upstream_error', status: 503 });
  });

  it('calls out rate limiting, which is the failure people actually hit', async () => {
    const error = await lookupByBBL('1000160001', { fetch: mockFetch({ status: 429 }) }).catch((e) => e);
    expect(error.message).toContain('app token');
  });

  it('rejects a response that is not an array', async () => {
    const error = await lookupByBBL('1000160001', {
      fetch: mockFetch({ violations: { error: true } }),
    }).catch((e) => e);
    expect(error).toMatchObject({ code: 'malformed_response' });
  });

  it('surfaces network failures as network_error', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    const error = await lookupByBBL('1000160001', { fetch: failing }).catch((e) => e);
    expect(error).toMatchObject({ code: 'network_error' });
  });

  it('honors an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await lookupByBBL('1000160001', {
      fetch: globalThis.fetch,
      signal: controller.signal,
    }).catch((e) => e);
    expect(error).toMatchObject({ code: 'aborted' });
  });
});

describe('lookupByAddress', () => {
  it('resolves an address and returns its violations', async () => {
    const result = await lookupByAddress('100 Gold St', { fetch: mockFetch() });
    expect(result.bbl).toBe('1000160001');
    expect(result.building.label).toContain('GOLD STREET');
    expect(result.violations).toHaveLength(2);
  });

  it('hands back the runner-up matches for disambiguation', async () => {
    const result = await lookupByAddress('100 Gold St', { fetch: mockFetch() });
    expect(result.alternatives.map((b) => b.bbl)).toEqual(['3000160001']);
  });

  it('throws address_not_found when nothing has a BBL', async () => {
    const error = await lookupByAddress('nowhere', {
      fetch: mockFetch({ geo: { features: [] } }),
    }).catch((e) => e);
    expect(error).toMatchObject({ code: 'address_not_found' });
  });
});
