/**
 * `@howellandgibbs/hpd-lookup/widget`
 *
 * Importing this module registers `<hpd-lookup>` as a custom element. Import
 * it for the side effect:
 *
 * ```js
 * import '@howellandgibbs/hpd-lookup/widget';
 * ```
 *
 * The core package stays DOM-free — this entry point is the only part that
 * touches the browser, so a Node consumer never pays for it.
 */
import { HpdLookupElement } from './element.js';

export { HpdLookupElement };

/** Element tag name. Exported so a host can check for conflicts. */
export const TAG_NAME = 'hpd-lookup';

/**
 * Register the element. Called automatically on import; safe to call again,
 * and a no-op if the name is already taken (by a second copy of this package,
 * or by the host's own element).
 */
export function defineHpdLookup(tagName: string = TAG_NAME): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tagName)) return;
  customElements.define(tagName, HpdLookupElement);
}

defineHpdLookup();

declare global {
  interface HTMLElementTagNameMap {
    'hpd-lookup': HpdLookupElement;
  }
}
