/**
 * Display formatting for the address labels GeoSearch returns.
 *
 * GeoSearch hands back a half-shouted string — the street is upper case, the
 * borough and country are not:
 *
 *     1742 EAST 172 STREET, Bronx, NY, USA
 *
 * {@link toSentenceCase} is the wrong tool for fixing that. It exists for HPD's
 * violation prose, where a leading house number *should* leave the next word
 * alone ("10 SQUARE FEET OF MOLD" → "10 square feet of mold"). Run it on an
 * address and the whole thing stays lower case, because the first character is
 * a digit and there is no sentence to open. An address is a proper noun and
 * wants title case, so it gets its own function.
 */

/**
 * Tokens that stay upper case in an address.
 *
 * Deliberately much smaller than {@link PRESERVE_UPPERCASE}: that set carries
 * Roman numerals and two-letter legal abbreviations, which are fine in a
 * violation description and actively wrong in a street name.
 */
export const ADDRESS_PRESERVE_UPPERCASE: ReadonlySet<string> = new Set([
  'NY', 'NYC', 'NYS', 'US', 'USA',
]);

/**
 * Words that stay lower case mid-address. They are capitalized anyway when
 * they open a comma-separated segment, or when everything before them in that
 * segment is a house number — so "1 Avenue of the Americas" keeps its
 * lower-case joiners while "1 The Bowery" keeps its article.
 */
const MINOR_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the', 'to',
]);

/** House numbers, ranges, and fractions: "1742", "110-50", "1/2". */
function isNumericToken(token: string): boolean {
  return /^[\d/-]+$/.test(token);
}

/**
 * Format a GeoSearch address label for display.
 *
 * Title-cases the shouted portion, leaves the portion GeoSearch already cased
 * alone, and keeps `NY` and `USA` upper case. House numbers, ranges,
 * fractions, and ordinals pass through untouched.
 *
 * @param label - A label from {@link Building.label}, or any address string.
 * @returns The address in title case. Empty string for empty input.
 *
 * @example
 * formatAddress('1742 EAST 172 STREET, Bronx, NY, USA')
 * // => '1742 East 172 Street, Bronx, NY, USA'
 *
 * @example
 * formatAddress('1 AVENUE OF THE AMERICAS, New York, NY, USA')
 * // => '1 Avenue of the Americas, New York, NY, USA'
 */
export function formatAddress(label: string | null | undefined): string {
  if (!label) return '';

  const parts = label.split(/(\s+)/);
  let startOfSegment = true;
  let stillLeadingNumbers = true;

  return parts
    .map((part) => {
      if (part === '' || /^\s+$/.test(part)) return part;

      const core = part.replace(/[,.]+$/, '');
      const trailing = part.slice(core.length);
      const numeric = isNumericToken(core);

      // A token is "major" if nothing but the house number precedes it in its
      // segment. That is what separates "1 The Bowery" from "Avenue of the".
      const formatted = formatToken(core, startOfSegment || stillLeadingNumbers) + trailing;

      stillLeadingNumbers = (startOfSegment || stillLeadingNumbers) && numeric;
      startOfSegment = /,$/.test(part);
      if (startOfSegment) stillLeadingNumbers = true;

      return formatted;
    })
    .join('');
}

function formatToken(core: string, major: boolean): string {
  if (!core) return core;

  const upper = core.toUpperCase();
  if (ADDRESS_PRESERVE_UPPERCASE.has(upper)) return upper;

  // "1742", "110-50", "1/2" — nothing to case.
  if (isNumericToken(core)) return core;

  // Ordinals: "1ST" is a number, not a word. "1St" reads as a typo.
  if (/^\d+(st|nd|rd|th)$/i.test(core)) return core.toLowerCase();

  if (!major && MINOR_WORDS.has(core.toLowerCase())) return core.toLowerCase();

  return core.split('-').map(capitalizeWord).join('-');
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();

  // McDonald Avenue, McGuinness Boulevard. "Mac" is deliberately not handled:
  // Macon Street is a real Brooklyn street and "MacOn" is nonsense, and there
  // is no way to tell it from MacDougal without a name list.
  if (/^mc[a-z]{3,}$/.test(lower)) {
    return 'Mc' + lower.charAt(2).toUpperCase() + lower.slice(3);
  }

  // Only the first character moves, so "MARK'S" becomes "Mark's" and not
  // "Mark'S".
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
