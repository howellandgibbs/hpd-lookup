import type { Building, ParsedViolation, ViolationClass, ViolationState } from '../types.js';
import { searchAddresses } from '../geosearch.js';
import { lookupByBBL } from '../violations.js';
import { isHpdLookupError } from '../errors.js';
import { WIDGET_STYLES } from './styles.js';

const DEBOUNCE_MS = 250;

/**
 * `<hpd-lookup>` — an address box that returns HPD violations in plain English.
 *
 * The element owns no data of its own: it calls the same public functions the
 * package exports, so anything it displays can be reproduced in a script.
 *
 * @example
 * ```html
 * <script type="module" src="/hpd-lookup/widget.js"></script>
 * <hpd-lookup states="open" app-token="…"></hpd-lookup>
 * ```
 *
 * Attributes:
 * - `address` — prefill the input
 * - `auto` — look up the prefilled address on connect, without waiting for submit
 * - `states` — comma-separated `open`, `closed`, `dismissed`
 * - `classes` — comma-separated HPD classes `A`, `B`, `C`, `I`
 * - `limit` — max records to request
 * - `app-token` — Socrata app token, which raises the rate limit
 * - `label` — override the input label text
 *
 * Events:
 * - `hpd-results` — `{ building, violations }` after a successful lookup
 * - `hpd-error` — `{ error }` when a lookup fails
 */
export class HpdLookupElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['label', 'address'];
  }

  #root: ShadowRoot;
  #input!: HTMLInputElement;
  #button!: HTMLButtonElement;
  #listbox!: HTMLUListElement;
  #status!: HTMLParagraphElement;
  #results!: HTMLUListElement;
  #label!: HTMLLabelElement;

  #suggestions: Building[] = [];
  #activeIndex = -1;
  #debounce: ReturnType<typeof setTimeout> | null = null;
  /** Aborts the in-flight request when a newer one supersedes it. */
  #controller: AbortController | null = null;
  /** Monotonic request id, so a slow response can't overwrite a newer one. */
  #requestId = 0;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.#input) this.#render();
    const address = this.getAttribute('address');
    if (address) this.#input.value = address;
    if (address && this.hasAttribute('auto')) void this.#lookup(address);
  }

  disconnectedCallback(): void {
    if (this.#debounce) clearTimeout(this.#debounce);
    this.#controller?.abort();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.#input) return;
    if (name === 'label') this.#label.textContent = value ?? 'Address';
    if (name === 'address' && value !== null) this.#input.value = value;
  }

  /** Look up an address programmatically, as if it had been submitted. */
  async search(address: string): Promise<void> {
    this.#input.value = address;
    await this.#lookup(address);
  }

  #render(): void {
    const style = document.createElement('style');
    style.textContent = WIDGET_STYLES;

    const id = `hpd-${Math.random().toString(36).slice(2, 9)}`;

    const field = el('div', { class: 'field' });
    this.#label = el(
      'label',
      { for: `${id}-input` },
      this.getAttribute('label') ?? 'Address',
    ) as HTMLLabelElement;

    const row = el('div', { class: 'input-row' });
    const combobox = el('div', { class: 'combobox' });

    this.#input = el('input', {
      id: `${id}-input`,
      type: 'text',
      role: 'combobox',
      autocomplete: 'off',
      'aria-expanded': 'false',
      'aria-controls': `${id}-listbox`,
      'aria-autocomplete': 'list',
      placeholder: 'e.g. 654 Park Place, Brooklyn',
    }) as HTMLInputElement;

    this.#listbox = el('ul', { id: `${id}-listbox`, role: 'listbox', hidden: '' }) as HTMLUListElement;
    this.#button = el('button', { type: 'button' }, 'Look up') as HTMLButtonElement;

    // role="status" announces politely without stealing focus. It must stay in
    // the DOM at all times — a live region added at the same moment as its text
    // is not reliably announced.
    this.#status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' }) as HTMLParagraphElement;
    this.#results = el('ul', { class: 'results' }) as HTMLUListElement;

    combobox.append(this.#input, this.#listbox);
    row.append(combobox, this.#button);
    field.append(this.#label, row);
    this.#root.append(style, field, this.#status, this.#results);

    this.#input.addEventListener('input', () => this.#onInput());
    this.#input.addEventListener('keydown', (e) => this.#onKeydown(e));
    this.#input.addEventListener('blur', () => {
      // Let a click on an option land before the list closes.
      setTimeout(() => this.#closeSuggestions(), 120);
    });
    this.#button.addEventListener('click', () => void this.#lookup(this.#input.value));
  }

  #onInput(): void {
    const query = this.#input.value.trim();
    if (this.#debounce) clearTimeout(this.#debounce);
    if (query.length < 3) {
      this.#closeSuggestions();
      return;
    }
    this.#debounce = setTimeout(() => void this.#suggest(query), DEBOUNCE_MS);
  }

  async #suggest(query: string): Promise<void> {
    const id = ++this.#requestId;
    try {
      const buildings = await searchAddresses(query, this.#requestOptions());
      if (id !== this.#requestId) return;
      this.#suggestions = buildings;
      this.#renderSuggestions();
    } catch {
      // A failed autocomplete is not worth interrupting typing over. The
      // submit path reports errors properly.
      this.#closeSuggestions();
    }
  }

  #renderSuggestions(): void {
    this.#listbox.replaceChildren();
    this.#activeIndex = -1;
    this.#input.removeAttribute('aria-activedescendant');

    if (!this.#suggestions.length) {
      this.#closeSuggestions();
      return;
    }

    this.#suggestions.forEach((building, index) => {
      const option = el(
        'li',
        { role: 'option', id: `${this.#input.id}-opt-${index}`, 'aria-selected': 'false' },
        el('span', {}, building.label),
      );
      if (building.borough) option.append(el('span', { class: 'option-borough' }, building.borough));
      option.addEventListener('mousedown', (e) => e.preventDefault());
      option.addEventListener('click', () => this.#choose(index));
      this.#listbox.append(option);
    });

    this.#listbox.hidden = false;
    this.#input.setAttribute('aria-expanded', 'true');
  }

  #closeSuggestions(): void {
    this.#listbox.hidden = true;
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.removeAttribute('aria-activedescendant');
    this.#activeIndex = -1;
  }

  #onKeydown(event: KeyboardEvent): void {
    const open = !this.#listbox.hidden;

    switch (event.key) {
      case 'ArrowDown':
        if (!open) return;
        event.preventDefault();
        this.#highlight((this.#activeIndex + 1) % this.#suggestions.length);
        break;
      case 'ArrowUp':
        if (!open) return;
        event.preventDefault();
        // From nothing highlighted (-1), Up goes to the last option, not the
        // first — plain modular arithmetic gets this backwards.
        this.#highlight(
          this.#activeIndex <= 0 ? this.#suggestions.length - 1 : this.#activeIndex - 1,
        );
        break;
      case 'Enter':
        event.preventDefault();
        if (open && this.#activeIndex >= 0) this.#choose(this.#activeIndex);
        else void this.#lookup(this.#input.value);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          this.#closeSuggestions();
        }
        break;
      default:
        break;
    }
  }

  #highlight(index: number): void {
    const options = Array.from(this.#listbox.children);
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    this.#activeIndex = index;
    const active = options[index];
    if (active) {
      this.#input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  #choose(index: number): void {
    const building = this.#suggestions[index];
    if (!building) return;
    this.#input.value = building.label;
    this.#closeSuggestions();
    void this.#lookup(building.label, building);
  }

  async #lookup(address: string, known?: Building): Promise<void> {
    const query = address.trim();
    if (!query) {
      this.#setStatus('Enter an address to look up.', 'error');
      return;
    }

    this.#closeSuggestions();
    this.#controller?.abort();
    this.#controller = new AbortController();
    const id = ++this.#requestId;

    this.#button.disabled = true;
    this.#results.replaceChildren();
    this.#setStatus('Looking up violations…');

    try {
      const building = known ?? (await this.#resolve(query));
      const { violations } = await lookupByBBL(building.bbl, this.#requestOptions());
      if (id !== this.#requestId) return;

      this.#renderResults(building, violations);
      this.dispatchEvent(
        new CustomEvent('hpd-results', { detail: { building, violations }, bubbles: true }),
      );
    } catch (error) {
      if (id !== this.#requestId) return;
      if (isHpdLookupError(error) && error.code === 'aborted') return;
      this.#setStatus(this.#messageFor(error), 'error');
      this.dispatchEvent(new CustomEvent('hpd-error', { detail: { error }, bubbles: true }));
    } finally {
      if (id === this.#requestId) this.#button.disabled = false;
    }
  }

  async #resolve(query: string): Promise<Building> {
    const [building] = await searchAddresses(query, this.#requestOptions());
    if (!building) {
      throw Object.assign(new Error('address_not_found'), { name: 'HpdLookupError', code: 'address_not_found' });
    }
    return building;
  }

  #renderResults(building: Building, violations: ParsedViolation[]): void {
    if (!violations.length) {
      this.#setStatus(`No violations on record for ${building.label}.`);
      return;
    }

    const count = violations.length === 1 ? '1 violation' : `${violations.length} violations`;
    this.#setStatus(`${count} for ${building.label}.`);

    for (const violation of violations) {
      this.#results.append(this.#renderViolation(violation));
    }
  }

  #renderViolation(violation: ParsedViolation): HTMLLIElement {
    const item = el('li', { class: 'violation' }) as HTMLLIElement;

    const top = el('div', { class: 'violation-top' });
    top.append(
      el(
        'span',
        { class: `pill state-${violation.status.state}` },
        el('span', { class: 'dot', 'aria-hidden': 'true' }),
        violation.status.label,
      ),
    );
    if (violation.class) {
      top.append(el('span', { class: 'meta' }, `Class ${violation.class}: ${violation.severity ?? ''}`));
    }
    if (violation.inspectionDate) {
      top.append(el('span', { class: 'meta' }, formatDate(violation.inspectionDate)));
    }

    item.append(top, el('p', { class: 'description' }, violation.description));
    if (violation.location) item.append(el('p', { class: 'location' }, violation.location));

    const bottom = el('div', { class: 'violation-bottom' });
    if (violation.id) bottom.append(el('span', {}, `ID ${violation.id}`));
    if (violation.apartment) bottom.append(el('span', {}, apartmentLabel(violation.apartment)));
    if (violation.rentImpairing) bottom.append(el('span', { class: 'rent-impairing' }, 'Rent-impairing'));
    if (bottom.childElementCount) item.append(bottom);

    return item;
  }

  #setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    this.#status.textContent = message;
    this.#status.dataset['tone'] = tone;
  }

  #messageFor(error: unknown): string {
    if (!isHpdLookupError(error)) return 'Something went wrong. Try again.';
    switch (error.code) {
      case 'address_not_found':
        return 'No NYC building matched that address. Try adding the borough.';
      case 'upstream_error':
        return error.status === 429
          ? 'The city’s data service is rate limiting requests. Wait a moment and try again.'
          : 'The city’s data service is not responding right now. Try again shortly.';
      case 'network_error':
        return 'Could not reach the city’s data service. Check your connection.';
      case 'invalid_input':
        return 'That address does not look right. Try a street number and name.';
      default:
        return 'Something went wrong. Try again.';
    }
  }

  #requestOptions() {
    const token = this.getAttribute('app-token');
    const limit = Number(this.getAttribute('limit'));
    return {
      ...(token ? { appToken: token } : {}),
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      ...(this.#controller ? { signal: this.#controller.signal } : {}),
      ...(this.#list('states').length ? { states: this.#list('states') as ViolationState[] } : {}),
      ...(this.#list('classes').length
        ? { classes: this.#list('classes').map((c) => c.toUpperCase()) as ViolationClass[] }
        : {}),
    };
  }

  #list(attribute: string): string[] {
    return (this.getAttribute(attribute) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function el(
  tag: string,
  attributes: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

/**
 * HPD's `apartment` field sometimes already carries the word "apt"
 * (`APT1RB`, `APT 4B`), so prefixing unconditionally reads "Apt APT1RB".
 */
function apartmentLabel(apartment: string): string {
  return /^apt\b|^apt(?=\d)/i.test(apartment.trim()) ? apartment : `Apt ${apartment}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
