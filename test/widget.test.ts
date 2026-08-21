// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/widget/index.js';
import type { HpdLookupElement } from '../src/widget/element.js';

const GEO_RESPONSE = {
  features: [
    {
      geometry: { coordinates: [-73.9601, 40.6738] },
      properties: {
        label: '654 PARK PLACE, Brooklyn, NY, USA',
        borough: 'Brooklyn',
        addendum: { pad: { bbl: '3012380016', bin: '3030303' } },
      },
    },
    {
      properties: {
        label: '654 PARK PLACE, Queens, NY, USA',
        addendum: { pad: { bbl: '4012380016' } },
      },
    },
  ],
};

const VIOLATIONS = [
  {
    violationid: '19103589',
    novdescription: '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER',
    currentstatus: 'VIOLATION OPEN',
    violationstatus: 'Open',
    class: 'B',
    apartment: 'APT1RB',
    inspectiondate: '2026-07-29T00:00:00.000',
    rentimpairing: 'Y',
  },
];

/** Route by hostname so tests don't depend on exact query strings. */
function mockFetch(overrides: { geo?: unknown; violations?: unknown; status?: number } = {}) {
  return vi.fn(async (url: string | URL) => {
    const href = String(url);
    const body = href.includes('geosearch')
      ? (overrides.geo ?? GEO_RESPONSE)
      : (overrides.violations ?? VIOLATIONS);
    return new Response(JSON.stringify(body), {
      status: overrides.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function mount(attributes: Record<string, string> = {}): HpdLookupElement {
  const element = document.createElement('hpd-lookup') as HpdLookupElement;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  document.body.append(element);
  return element;
}

const shadow = (element: HpdLookupElement) => element.shadowRoot!;
const input = (element: HpdLookupElement) => shadow(element).querySelector('input')!;
const status = (element: HpdLookupElement) => shadow(element).querySelector('.status')!;
const options = (element: HpdLookupElement) =>
  Array.from(shadow(element).querySelectorAll('[role="option"]'));
const violations = (element: HpdLookupElement) =>
  Array.from(shadow(element).querySelectorAll('.violation'));

/** Type into the input and let the 250ms debounce elapse. */
async function type(element: HpdLookupElement, text: string): Promise<void> {
  input(element).value = text;
  input(element).dispatchEvent(new Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 320));
}

function press(element: HpdLookupElement, key: string): void {
  input(element).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('<hpd-lookup> registration', () => {
  it('registers the element', () => {
    expect(customElements.get('hpd-lookup')).toBeTruthy();
  });

  it('upgrades into a shadow root with the expected controls', () => {
    const element = mount();
    expect(shadow(element).querySelector('input')).toBeTruthy();
    expect(shadow(element).querySelector('button')).toBeTruthy();
    expect(shadow(element).querySelector('[role="listbox"]')).toBeTruthy();
  });
});

describe('accessibility wiring', () => {
  it('binds the label to the input', () => {
    const element = mount();
    const label = shadow(element).querySelector('label')!;
    expect(label.getAttribute('for')).toBe(input(element).id);
    expect(input(element).id).toBeTruthy();
  });

  it('gives each instance a distinct id, so two widgets on a page do not collide', () => {
    expect(input(mount()).id).not.toBe(input(mount()).id);
  });

  it('marks the input as a collapsed combobox before anything is typed', () => {
    const element = mount();
    expect(input(element).getAttribute('role')).toBe('combobox');
    expect(input(element).getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a live region in the DOM from the start', () => {
    // A live region inserted at the same moment as its text is not reliably
    // announced, so it has to exist before there is anything to say.
    const element = mount();
    expect(status(element).getAttribute('role')).toBe('status');
    expect(status(element).getAttribute('aria-live')).toBe('polite');
  });

  it('takes a custom label', () => {
    const element = mount({ label: 'NYC address' });
    expect(shadow(element).querySelector('label')!.textContent).toBe('NYC address');
  });
});

describe('suggestions', () => {
  it('does not search until there are enough characters to be worth it', async () => {
    const element = mount();
    await type(element, 'ab');
    expect(fetch).not.toHaveBeenCalled();
    expect(options(element)).toHaveLength(0);
  });

  it('lists matching addresses and expands the combobox', async () => {
    const element = mount();
    await type(element, '654 Park');
    expect(options(element)).toHaveLength(2);
    expect(input(element).getAttribute('aria-expanded')).toBe('true');
  });

  it('moves the active option with the arrow keys', async () => {
    const element = mount();
    await type(element, '654 Park');

    press(element, 'ArrowDown');
    expect(input(element).getAttribute('aria-activedescendant')).toBe(options(element)[0]!.id);
    expect(options(element)[0]!.getAttribute('aria-selected')).toBe('true');

    press(element, 'ArrowDown');
    expect(input(element).getAttribute('aria-activedescendant')).toBe(options(element)[1]!.id);
    expect(options(element)[0]!.getAttribute('aria-selected')).toBe('false');
  });

  it('wraps around at the end of the list', async () => {
    const element = mount();
    await type(element, '654 Park');
    press(element, 'ArrowUp');
    expect(input(element).getAttribute('aria-activedescendant')).toBe(options(element)[1]!.id);
  });

  it('closes the list on Escape without running a lookup', async () => {
    const element = mount();
    await type(element, '654 Park');
    press(element, 'Escape');
    expect(input(element).getAttribute('aria-expanded')).toBe('false');
    expect(input(element).hasAttribute('aria-activedescendant')).toBe(false);
    expect(violations(element)).toHaveLength(0);
  });

  it('does not surface a failed autocomplete, since the user is still typing', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 500 }));
    const element = mount();
    await type(element, '654 Park');
    expect(status(element).textContent).toBe('');
    expect(input(element).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('lookup', () => {
  it('renders parsed violations and announces the count', async () => {
    const element = mount();
    await element.search('654 Park Place, Brooklyn');

    expect(violations(element)).toHaveLength(1);
    // The status shows displayLabel, not the shouted label GeoSearch returned.
    expect(status(element).textContent).toContain('1 violation for 654 Park Place');
    expect(shadow(element).querySelector('.description')!.textContent).toBe('Repair the broken plaster');
  });

  it('shows the translated status, not the raw code', async () => {
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    expect(shadow(element).querySelector('.pill')!.textContent).toContain(
      'Open — landlord has not fixed it yet',
    );
  });

  it('does not repeat "Apt" when HPD already included it', async () => {
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    const bottom = shadow(element).querySelector('.violation-bottom')!.textContent ?? '';
    expect(bottom).toContain('APT1RB');
    expect(bottom).not.toContain('Apt APT1RB');
  });

  it('flags rent-impairing violations', async () => {
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    expect(shadow(element).querySelector('.rent-impairing')).toBeTruthy();
  });

  it('reports an empty result rather than showing nothing', async () => {
    vi.stubGlobal('fetch', mockFetch({ violations: [] }));
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    expect(status(element).textContent).toContain('No violations on record');
    expect(violations(element)).toHaveLength(0);
  });

  it('emits hpd-results with the building and violations', async () => {
    const element = mount();
    const handler = vi.fn();
    element.addEventListener('hpd-results', handler);
    await element.search('654 Park Place, Brooklyn');

    expect(handler).toHaveBeenCalledOnce();
    const detail = handler.mock.calls[0]![0].detail;
    expect(detail.building.bbl).toBe('3012380016');
    expect(detail.violations).toHaveLength(1);
  });

  it('looks up a prefilled address on connect when asked', async () => {
    const element = mount({ address: '654 Park Place, Brooklyn', auto: '' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input(element).value).toBe('654 Park Place, Brooklyn');
    expect(violations(element)).toHaveLength(1);
  });

  it('does not look up a prefilled address without the auto attribute', async () => {
    const element = mount({ address: '654 Park Place, Brooklyn' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input(element).value).toBe('654 Park Place, Brooklyn');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  it('asks for a borough when nothing matched', async () => {
    vi.stubGlobal('fetch', mockFetch({ geo: { features: [] } }));
    const element = mount();
    await element.search('nowhere at all');

    expect(status(element).textContent).toContain('No NYC building matched');
    expect(status(element).getAttribute('data-tone')).toBe('error');
  });

  it('explains rate limiting in plain language', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 429 }));
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    expect(status(element).textContent).toContain('rate limiting');
  });

  it('reports an unreachable service without leaking an error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const element = mount();
    await element.search('654 Park Place, Brooklyn');

    expect(status(element).textContent).toContain('Could not reach');
    expect(status(element).textContent).not.toContain('network_error');
  });

  it('emits hpd-error', async () => {
    vi.stubGlobal('fetch', mockFetch({ geo: { features: [] } }));
    const element = mount();
    const handler = vi.fn();
    element.addEventListener('hpd-error', handler);
    await element.search('nowhere at all');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects an empty submission before making a request', async () => {
    const element = mount();
    await element.search('   ');
    expect(fetch).not.toHaveBeenCalled();
    expect(status(element).textContent).toContain('Enter an address');
  });
});

describe('request lifecycle', () => {
  it('clears previous results before the next lookup renders', async () => {
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    expect(violations(element)).toHaveLength(1);

    vi.stubGlobal('fetch', mockFetch({ violations: [] }));
    await element.search('654 Park Place, Brooklyn');
    expect(violations(element)).toHaveLength(0);
  });

  it('keeps focus inside the widget when the button disables itself', async () => {
    // Disabling the focused element sends focus to the body, so the next
    // keystroke goes nowhere and a keyboard user is stranded mid-task.
    const element = mount();
    const button = shadow(element).querySelector('button')!;
    button.focus();
    expect(shadow(element).activeElement).toBe(button);

    await element.search('654 Park Place, Brooklyn');

    expect(document.activeElement).not.toBe(document.body);
    expect(shadow(element).activeElement).toBe(input(element));
  });

  it('does not steal focus when the button was not focused', async () => {
    const element = mount();
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();

    await element.search('654 Park Place, Brooklyn');

    expect(document.activeElement).toBe(outside);
  });

  it('re-enables the submit button after a failure', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 500 }));
    const element = mount();
    await element.search('654 Park Place, Brooklyn');
    expect(shadow(element).querySelector('button')!.disabled).toBe(false);
  });

  it('stops work when the element is removed', async () => {
    const element = mount();
    await type(element, '654 Park');
    element.remove();
    // Nothing should throw, and no state should be left mid-flight.
    expect(document.body.children).toHaveLength(0);
  });
});
