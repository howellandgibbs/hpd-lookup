/**
 * Text normalization for HPD prose.
 *
 * HPD writes violation descriptions in all-caps, mid-sentence, with agency
 * acronyms and apartment numbers mixed in. Lowercasing the whole thing is
 * worse than leaving it shouting, so the rules here put case back with the
 * acronyms and unit numbers intact.
 */

/**
 * Tokens that stay uppercase after sentence-casing: city and state agencies,
 * legal codes, ID types, and Roman numerals used in HPD class references.
 */
export const PRESERVE_UPPERCASE: ReadonlySet<string> = new Set([
  'HPD', 'DEC', 'NOV', 'NYC', 'NYS', 'DOH', 'DOHMH', 'DEP', 'DOB',
  'FDNY', 'NYCHA', 'IPM', 'DHCR', 'ADA', 'DOL', 'EPA', 'DCWP',
  'HMC', 'MDL', 'ECB', 'OATH', 'TTY', 'EIN', 'SSN', 'LL', 'BIN',
  'BBL', 'AEP', 'SRO', 'USPS', 'PDF', 'LLC', 'PC', 'PA',
  'I', 'II', 'III', 'IV', 'V',
]);

/**
 * Convert HPD's all-caps prose to sentence case.
 *
 * Capitalizes the first letter of each sentence, restores known acronyms to
 * uppercase, title-cases unit prefixes (`APT 4B` → `Apt 4B`), and uppercases
 * bare unit designators (`4b` → `4B`).
 *
 * @param str - Raw text, typically all-caps.
 * @returns Sentence-cased text. Empty string for empty input.
 *
 * @example
 * toSentenceCase('REPAIR THE BROKEN PLASTER IN APT 4b PER HMC')
 * // => 'Repair the broken plaster in Apt 4B per HMC'
 */
export function toSentenceCase(str: string | null | undefined): string {
  if (!str) return '';
  let out = str.toLowerCase();

  // Capitalize the start of the string and of each sentence.
  out = out.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, prefix: string, ch: string) => prefix + ch.toUpperCase());

  // Restore acronyms.
  out = out.replace(/\b([a-z]+)\b/gi, (match: string) => {
    const upper = match.toUpperCase();
    return PRESERVE_UPPERCASE.has(upper) ? upper : match;
  });

  // "apt 4b" -> "Apt 4B", "floor 2" -> "Floor 2".
  out = out.replace(
    /\b(apt|fl|floor|unit|rm|room)\s+(\d+[a-z]?)\b/gi,
    (_m, prefix: string, num: string) =>
      prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase() + ' ' + num.toUpperCase(),
  );

  // Bare unit designators: "4b" -> "4B".
  out = out.replace(/\b(\d+[a-z])\b/g, (match: string) => match.toUpperCase());

  // Run-together unit designators: "apt1rb" -> "APT1RB", "gf1" -> "GF1". HPD
  // writes these without a space, so the rule above never sees them.
  //
  // The bounds are deliberate, and each one was set by looking at what changed
  // across live records:
  //  - two to four leading letters, so ordinary words that happen to end in a
  //    number are left alone ("material4th" stays as HPD typed it)
  //  - must start the token, which excludes ordinals ("1st", "2nd")
  //  - not preceded by a slash or word character, which keeps measurements
  //    intact ("0.5mg/cm2" is a lead-paint reading, not an apartment)
  out = out.replace(
    /(^|[^\w/])([a-z]{2,4}\d+[a-z\d]*)\b/g,
    (_m, prefix: string, token: string) => prefix + token.toUpperCase(),
  );

  return out;
}
