/**
 * Widget styles.
 *
 * Deliberately unopinionated: neutral colors, system fonts, no shadows or
 * animation beyond what state changes need. Everything a host would want to
 * change is a CSS custom property, so theming never requires overriding a
 * selector inside the shadow root.
 *
 * Colors are defined once for light and overridden under
 * `prefers-color-scheme: dark`. A host that sets a property explicitly wins in
 * both, because the override only redefines the token defaults.
 */
export const WIDGET_STYLES = /* css */ `
  :host {
    /* Type */
    --hpd-font: system-ui, -apple-system, "Segoe UI", sans-serif;
    --hpd-font-size: 1rem;
    --hpd-line-height: 1.5;

    /* Color */
    --hpd-text: #1a1a1a;
    --hpd-text-muted: #5c5c5c;
    --hpd-bg: #ffffff;
    --hpd-bg-subtle: #f5f5f4;
    --hpd-border: #d4d4d0;
    --hpd-accent: #1c5d99;
    --hpd-accent-text: #ffffff;
    --hpd-focus: #1c5d99;

    /* Violation state */
    --hpd-open: #a8341f;
    --hpd-closed: #2d6a4f;
    --hpd-dismissed: #5c5c5c;

    /* Shape */
    --hpd-radius: 6px;
    --hpd-gap: 0.75rem;

    display: block;
    font-family: var(--hpd-font);
    font-size: var(--hpd-font-size);
    line-height: var(--hpd-line-height);
    color: var(--hpd-text);
    background: var(--hpd-bg);
    box-sizing: border-box;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --hpd-text: #f0efec;
      --hpd-text-muted: #a8a5a0;
      --hpd-bg: #16161a;
      --hpd-bg-subtle: #202026;
      --hpd-border: #3a3a42;
      --hpd-accent: #6ba3d6;
      --hpd-accent-text: #10121a;
      --hpd-focus: #6ba3d6;
      --hpd-open: #f08a72;
      --hpd-closed: #74c69d;
      --hpd-dismissed: #a8a5a0;
    }
  }

  *, *::before, *::after { box-sizing: inherit; }

  .field { display: flex; flex-direction: column; gap: 0.35rem; }

  label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .hint { font-size: 0.8125rem; color: var(--hpd-text-muted); }

  .input-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .combobox { position: relative; flex: 1 1 16rem; min-width: 0; }

  input {
    width: 100%;
    padding: 0.5rem 0.65rem;
    font: inherit;
    color: inherit;
    background: var(--hpd-bg);
    border: 1px solid var(--hpd-border);
    border-radius: var(--hpd-radius);
  }

  input:focus-visible,
  button:focus-visible,
  [role="option"]:focus-visible {
    outline: 2px solid var(--hpd-focus);
    outline-offset: 2px;
  }

  button {
    padding: 0.5rem 1rem;
    font: inherit;
    font-weight: 600;
    color: var(--hpd-accent-text);
    background: var(--hpd-accent);
    border: 1px solid transparent;
    border-radius: var(--hpd-radius);
    cursor: pointer;
  }

  button[disabled] { opacity: 0.6; cursor: default; }

  /* Suggestions */
  [role="listbox"] {
    position: absolute;
    z-index: 10;
    inset-inline: 0;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
    background: var(--hpd-bg);
    border: 1px solid var(--hpd-border);
    border-radius: var(--hpd-radius);
    max-height: 15rem;
    overflow-y: auto;
  }

  [role="listbox"][hidden] { display: none; }

  [role="option"] {
    padding: 0.5rem 0.65rem;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  [role="option"][aria-selected="true"],
  [role="option"]:hover {
    background: var(--hpd-bg-subtle);
  }

  .option-borough { color: var(--hpd-text-muted); font-size: 0.875rem; }

  /* Status line: also the live region, so it must stay in the DOM. */
  .status {
    margin-top: var(--hpd-gap);
    font-size: 0.9375rem;
    color: var(--hpd-text-muted);
  }

  .status[data-tone="error"] { color: var(--hpd-open); }
  .status:empty { display: none; }

  /* Results */
  .results { margin: var(--hpd-gap) 0 0; padding: 0; list-style: none; }

  .violation {
    padding: var(--hpd-gap) 0;
    border-top: 1px solid var(--hpd-border);
  }

  .violation-top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: currentColor;
  }

  .state-open { color: var(--hpd-open); }
  .state-closed { color: var(--hpd-closed); }
  .state-dismissed { color: var(--hpd-dismissed); }

  .meta { font-size: 0.8125rem; color: var(--hpd-text-muted); }

  .description { margin: 0; }

  .location { margin: 0.2rem 0 0; font-size: 0.9375rem; color: var(--hpd-text-muted); }

  .violation-bottom {
    margin-top: 0.35rem;
    font-size: 0.8125rem;
    color: var(--hpd-text-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .rent-impairing { font-weight: 600; color: var(--hpd-open); }

  @media (prefers-reduced-motion: no-preference) {
    button, [role="option"] { transition: background-color 120ms ease; }
  }
`;
