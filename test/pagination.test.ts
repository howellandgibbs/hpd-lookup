import { describe, expect, it, vi } from 'vitest';
import { lookupByAddress, lookupByBBL, MAX_LIMIT, PAGE_SIZE } from '../src/violations.js';
import { summarize } from '../src/widget/summary.js';
import type { RawViolation } from '../src/types.js';

/**
 * A fake Socrata that honours $limit and $offset over `count` records, the way
 * the real API does. Records alternate open/closed so filter tests have
 * something to filter.
 */
function paginatingFetch(count: number, opts: { failAtOffset?: number } = {}) {
  const records: RawViolation[] = Array.from({ length: count }, (_, i) => ({
    violationid: String(100000 + i),
    novdescription: '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER',
    currentstatus: i % 2 === 0 ? 'VIOLATION OPEN' : 'VIOLATION CLOSED',
    violationstatus: i % 2 === 0 ? 'Open' : 'Close',
    class: 'B',
  }));

  const spy = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname.includes('geosearch')) {
      return json({
        features: [{ properties: { label: '1593 FULTON STREET, Brooklyn, NY, USA', addendum: { pad: { bbl: '3016840001' } } } }],
      });
    }
    const limit = Number(url.searchParams.get('$limit'));
    const offset = Number(url.searchParams.get('$offset') ?? 0);
    if (opts.failAtOffset !== undefined && offset === opts.failAtOffset) {
      return new Response('{"error":true}', { status: 503 });
    }
    return json(records.slice(offset, offset + limit));
  });
  return spy as unknown as typeof globalThis.fetch & typeof spy;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const calls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([u]) => new URL(String(u))).filter((u) => !u.hostname.includes('geosearch'));

describe('pagination', () => {
  it('returns every record across page boundaries', async () => {
    // Shaped like 1593 Fulton Street, which surfaced the bug: 3,029 violations.
    const fetch = paginatingFetch(3029);
    const { violations, total, truncated } = await lookupByBBL('3016840001', { fetch });

    expect(violations).toHaveLength(3029);
    expect(total).toBe(3029);
    expect(truncated).toBe(false);
    expect(new Set(violations.map((v) => v.id)).size).toBe(3029);
  });

  it('requests pages at increasing offsets and stops on the short one', async () => {
    const fetch = paginatingFetch(2500);
    await lookupByBBL('3016840001', { fetch });

    const pages = calls(fetch).map((u) => [u.searchParams.get('$offset'), u.searchParams.get('$limit')]);
    expect(pages).toEqual([
      ['0', String(PAGE_SIZE)],
      ['1000', String(PAGE_SIZE)],
      ['2000', String(PAGE_SIZE)], // returns 500, which ends the loop
    ]);
  });

  it('makes one extra empty request when the count lands exactly on a page boundary', async () => {
    // There is no way to know page 2 is empty without asking for it.
    const fetch = paginatingFetch(2000);
    const { total, truncated } = await lookupByBBL('3016840001', { fetch });
    expect(calls(fetch)).toHaveLength(3);
    expect(total).toBe(2000);
    expect(truncated).toBe(false);
  });

  it('breaks ties on violationid, or offset paging duplicates and skips rows', async () => {
    // Ordering on inspectiondate alone is unstable within a date. Measured
    // against the live dataset on a 3,029-violation building, it returned five
    // rows twice and never returned five others.
    const fetch = paginatingFetch(10);
    await lookupByBBL('3016840001', { fetch });
    expect(calls(fetch)[0]!.searchParams.get('$order')).toBe('inspectiondate DESC, violationid DESC');
  });

  it('treats an explicit limit as a cap and reports truncation', async () => {
    const fetch = paginatingFetch(3029);
    const { violations, total, truncated } = await lookupByBBL('3016840001', { fetch, limit: 50 });

    expect(violations).toHaveLength(50);
    expect(total).toBe(50);
    expect(truncated).toBe(true);
    // One request, sized to the cap rather than a full page.
    expect(calls(fetch).map((u) => u.searchParams.get('$limit'))).toEqual(['50']);
  });

  it('sizes the final page to the remaining cap', async () => {
    const fetch = paginatingFetch(5000);
    await lookupByBBL('3016840001', { fetch, limit: 2500 });
    expect(calls(fetch).map((u) => u.searchParams.get('$limit'))).toEqual(['1000', '1000', '500']);
  });

  it('does not report truncation when a limit exceeds what exists', async () => {
    const fetch = paginatingFetch(30);
    const { total, truncated } = await lookupByBBL('3016840001', { fetch, limit: 50 });
    expect(total).toBe(30);
    expect(truncated).toBe(false);
  });

  it('counts total before client-side filters are applied', async () => {
    const fetch = paginatingFetch(3029);
    const { violations, total } = await lookupByBBL('3016840001', { fetch, states: ['open'] });
    expect(total).toBe(3029);
    expect(violations).toHaveLength(1515); // every even index is open
  });

  it('throws rather than returning a partial list when a later page fails', async () => {
    const fetch = paginatingFetch(3029, { failAtOffset: 2000 });
    const error = await lookupByBBL('3016840001', { fetch }).catch((e) => e);
    expect(error).toMatchObject({ code: 'upstream_error', status: 503 });
  });

  it('carries total and truncated through lookupByAddress', async () => {
    const fetch = paginatingFetch(3029);
    const result = await lookupByAddress('1593 Fulton Street, Brooklyn', { fetch });
    expect(result.total).toBe(3029);
    expect(result.truncated).toBe(false);
    expect(result.violations).toHaveLength(3029);
  });

  it('keeps the safety ceiling at 50,000 records', () => {
    expect(MAX_LIMIT).toBe(50_000);
  });
});

describe('summarize', () => {
  const place = '1593 Fulton Street, Brooklyn';

  it('states the full count when everything was fetched and shown', () => {
    expect(summarize(place, 3029, 3029, false)).toBe('3,029 violations for 1593 Fulton Street, Brooklyn.');
    expect(summarize(place, 1, 1, false)).toBe('1 violation for 1593 Fulton Street, Brooklyn.');
  });

  it('shows filtered count against the full record, not as if it were the total', () => {
    expect(summarize(place, 566, 3029, false)).toBe('566 of 3,029 violations for 1593 Fulton Street, Brooklyn.');
  });

  it('never claims a building has no violations when a filter removed them', () => {
    // This used to read "No violations on record" — false, and false in the
    // direction that makes a landlord look better than they are.
    const message = summarize(place, 0, 3029, false);
    expect(message).not.toContain('No violations on record');
    expect(message).toContain('3,029 on record');
  });

  it('says so plainly when a building really has no violations', () => {
    expect(summarize(place, 0, 0, false)).toBe('No violations on record for 1593 Fulton Street, Brooklyn.');
  });

  it('flags truncation instead of stating a capped count as the total', () => {
    // The original bug: "50 violations for 1593 FULTON STREET" on a building with 3,029.
    const message = summarize(place, 50, 50, true);
    expect(message).toBe('Showing the 50 most recent violations for 1593 Fulton Street, Brooklyn. More are on record.');
    expect(message).not.toMatch(/^50 violations for/);
  });

  it('handles a filter combined with truncation', () => {
    expect(summarize(place, 12, 50, true)).toBe(
      'Showing 12 of the 50 most recent violations for 1593 Fulton Street, Brooklyn. More are on record.',
    );
  });
});
