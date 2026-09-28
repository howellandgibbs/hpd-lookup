// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/widget/index.js';
import type { HpdLookupElement } from '../src/widget/element.js';
import { describePage } from '../src/widget/summary.js';

/** A fake GeoSearch + Socrata that honours $limit and $offset over `count` records. */
function fakeApis(count: number) {
  const records = Array.from({ length: count }, (_, i) => ({
    violationid: String(500000 + i),
    novdescription: `§ 27-2005 ADM CODE REPAIR ITEM NUMBER ${i + 1}`,
    currentstatus: 'VIOLATION OPEN',
    violationstatus: 'Open',
    class: 'B',
  }));
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname.includes('geosearch')) {
      return json({
        features: [{ properties: { label: '1593 FULTON STREET, Brooklyn, NY, USA', addendum: { pad: { bbl: '3016840001' } } } }],
      });
    }
    const limit = Number(url.searchParams.get('$limit'));
    const offset = Number(url.searchParams.get('$offset') ?? 0);
    return json(records.slice(offset, offset + limit));
  });
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function mount(attributes: Record<string, string> = {}): HpdLookupElement {
  const element = document.createElement('hpd-lookup') as HpdLookupElement;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  document.body.append(element);
  return element;
}

const root = (e: HpdLookupElement) => e.shadowRoot!;
const rows = (e: HpdLookupElement) => Array.from(root(e).querySelectorAll('.violation'));
const firstRowText = (e: HpdLookupElement) => rows(e)[0]!.querySelector('.description')!.textContent;
const pager = (e: HpdLookupElement) => root(e).querySelector('.pager') as HTMLElement;
const range = (e: HpdLookupElement) => root(e).querySelector('.pager-range')!.textContent;
const announcer = (e: HpdLookupElement) => root(e).querySelector('.sr-only')!.textContent;
const [prev, next] = [
  (e: HpdLookupElement) => root(e).querySelectorAll('.pager-button')[0] as HTMLButtonElement,
  (e: HpdLookupElement) => root(e).querySelectorAll('.pager-button')[1] as HTMLButtonElement,
];

beforeEach(() => vi.stubGlobal('fetch', fakeApis(120)));
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('widget paging', () => {
  it('puts only the first 50 rows in the DOM', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');

    expect(rows(element)).toHaveLength(50);
    expect(firstRowText(element)).toBe('Repair item number 1');
    expect(pager(element).hidden).toBe(false);
    expect(range(element)).toBe('Showing 1–50 of 120 · Page 1 of 3');
  });

  it('keeps the status line about the whole building, not the page', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');
    expect(root(element).querySelector('.status')!.textContent).toBe(
      '120 violations for 1593 Fulton Street, Brooklyn, NY, USA.',
    );
  });

  it('moves forward and back a page at a time', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');

    next(element).click();
    expect(range(element)).toBe('Showing 51–100 of 120 · Page 2 of 3');
    expect(firstRowText(element)).toBe('Repair item number 51');

    next(element).click();
    expect(range(element)).toBe('Showing 101–120 of 120 · Page 3 of 3');
    expect(rows(element)).toHaveLength(20);

    prev(element).click();
    expect(range(element)).toBe('Showing 51–100 of 120 · Page 2 of 3');
  });

  it('disables the button at each end', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');
    expect(prev(element).disabled).toBe(true);
    expect(next(element).disabled).toBe(false);

    next(element).click();
    next(element).click();
    expect(prev(element).disabled).toBe(false);
    expect(next(element).disabled).toBe(true);
  });

  it('hands focus to Previous when Next disables itself on the last page', async () => {
    // Disabling a focused button drops focus to the document body — the same
    // bug the Look up button had. Paging to the end must not strand the user.
    const element = mount();
    await element.search('1593 Fulton Street');
    next(element).focus();
    next(element).click();
    next(element).click();

    expect(next(element).disabled).toBe(true);
    expect(root(element).activeElement).toBe(prev(element));
  });

  it('hands focus to Next when Previous disables itself on the first page', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');
    next(element).click();
    prev(element).focus();
    prev(element).click();

    expect(prev(element).disabled).toBe(true);
    expect(root(element).activeElement).toBe(next(element));
  });

  it('hides the pager when everything fits on one page', async () => {
    vi.stubGlobal('fetch', fakeApis(30));
    const element = mount();
    await element.search('1593 Fulton Street');

    expect(rows(element)).toHaveLength(30);
    expect(pager(element).hidden).toBe(true);
  });

  it('honours a page-size attribute', async () => {
    const element = mount({ 'page-size': '20' });
    await element.search('1593 Fulton Street');
    expect(rows(element)).toHaveLength(20);
    expect(range(element)).toBe('Showing 1–20 of 120 · Page 1 of 6');
  });

  it('falls back to 50 for a nonsense page-size', async () => {
    const element = mount({ 'page-size': 'lots' });
    await element.search('1593 Fulton Street');
    expect(rows(element)).toHaveLength(50);
  });

  it('re-pages from the start when page-size changes after a lookup', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');
    next(element).click();

    element.setAttribute('page-size', '100');
    expect(range(element)).toBe('Showing 1–100 of 120 · Page 1 of 2');
  });

  it('starts a new lookup back on page 1', async () => {
    const element = mount();
    await element.search('1593 Fulton Street');
    next(element).click();
    next(element).click();

    await element.search('1593 Fulton Street');
    expect(range(element)).toBe('Showing 1–50 of 120 · Page 1 of 3');
  });

  it('announces page changes, but not the initial load', async () => {
    // The status line already announces the result count; a second
    // announcement of the page position on load would just be noise.
    const element = mount();
    await element.search('1593 Fulton Street');
    expect(announcer(element)).toBe('');

    next(element).click();
    expect(announcer(element)).toBe('Showing 51–100 of 120 · Page 2 of 3');
  });
});

describe('describePage', () => {
  it('formats large counts with separators', () => {
    expect(describePage(50, 50, 3029, 1, 61)).toBe('Showing 51–100 of 3,029 · Page 2 of 61');
  });

  it('handles a short final page', () => {
    expect(describePage(3000, 29, 3029, 60, 61)).toBe('Showing 3,001–3,029 of 3,029 · Page 61 of 61');
  });
});
