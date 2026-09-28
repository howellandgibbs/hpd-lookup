/**
 * The status line announced after a lookup.
 *
 * This sentence is a claim about a real building, so it must never state a
 * number it cannot stand behind. It distinguishes three things that used to be
 * flattened into "N violations": what is shown, what is on record, and whether
 * the record count itself was cut short by a `limit`.
 */
export function summarize(place: string, shown: number, total: number, truncated: boolean): string {
  const n = (count: number) => count.toLocaleString('en-US');
  const noun = (count: number) => (count === 1 ? 'violation' : 'violations');

  if (truncated) {
    const more = 'More are on record.';
    if (shown === 0) return `No matching violations among the ${n(total)} most recent for ${place}. ${more}`;
    if (shown === total) return `Showing the ${n(total)} most recent ${noun(total)} for ${place}. ${more}`;
    return `Showing ${n(shown)} of the ${n(total)} most recent violations for ${place}. ${more}`;
  }

  if (total === 0) return `No violations on record for ${place}.`;
  if (shown === 0) return `No matching violations for ${place}, out of ${n(total)} on record.`;
  if (shown < total) return `${n(shown)} of ${n(total)} violations for ${place}.`;
  return `${n(total)} ${noun(total)} for ${place}.`;
}

/**
 * The pager's position line, e.g. "Showing 51–100 of 3,029 · Page 2 of 61".
 * Also what the page-change announcement reads out.
 */
export function describePage(start: number, count: number, of: number, page: number, pages: number): string {
  const n = (value: number) => value.toLocaleString('en-US');
  return `Showing ${n(start + 1)}–${n(start + count)} of ${n(of)} · Page ${page + 1} of ${pages}`;
}
