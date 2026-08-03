import type {
  ClassSeverity,
  ParsedViolation,
  RawViolation,
  ViolationClass,
  ViolationState,
} from './types.js';
import { toSentenceCase } from './text.js';
import { translateStatus } from './status.js';

/**
 * Verbs HPD uses to open the actual instruction in a violation description.
 *
 * A violation reads like `§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER…` —
 * everything before the verb is legal citation. Anchoring on the verb is more
 * reliable than trying to match every citation format HPD has ever emitted.
 */
export const HPD_ACTION_VERBS: ReadonlySet<string> = new Set([
  'abate', 'adjust', 'apply', 'arrange',
  'caulk', 'certify', 'clean', 'clear', 'close', 'correct',
  'demolish', 'discontinue',
  'eliminate', 'enclose', 'erect', 'establish', 'exterminate',
  'file', 'fix', 'furnish',
  'hang',
  'install',
  'keep',
  'maintain', 'make',
  'obtain',
  'paint', 'patch', 'parge', 'perform', 'plaster', 'plug', 'post',
  'properly', 'provide', 'purge',
  'rearrange', 'rebuild', 'reconstruct', 'refit', 'refinish',
  'rehang', 'remediate', 'remedy', 'remove', 'repair', 'replace',
  'replaster', 'replumb', 'restore', 'resurface', 'rewire',
  'scrape', 'seal', 'secure', 'submit', 'supply',
  'tighten', 'trace', 'trim',
  'upgrade',
  'ventilate',
  'weatherize', 'wire',
]);

/**
 * Words that belong to a legal citation rather than to the description.
 *
 * Used as a secondary signal: once we have passed citation material, the first
 * substantive word that is not on this list starts the description, even when
 * no known action verb appears.
 */
export const CITATION_WORDS: ReadonlySet<string> = new Set([
  'hmc', 'mdl', 'adm', 'admin', 'code', 'rcny', 'nyc', 'nys',
  'and', 'or', 'of', 'the', 'in', 'at', 'to', 'for', 'by',
  'a', 'an', 'no', 'not', 'per', 'law', 'local', 'section',
  'sec', 'sub', 'subdivision', 'article', 'chapter', 'title',
  'pursuant', 'accordance', 'with', 'under', 'also', 'see',
  'dm', 'multiple', 'dwelling',
  'dept', 'department', 'rules', 'regs', 'regulations', 'rule',
]);

/** Plain-English severity for each HPD violation class. */
export const CLASS_SEVERITY: Readonly<Record<ViolationClass, ClassSeverity>> = {
  A: 'Non-hazardous',
  B: 'Hazardous',
  C: 'Immediately hazardous',
  I: 'Information',
};

/** The description split into what is wrong and where it is. */
export interface CleanedDescription {
  /** The instruction itself, sentence-cased, citation stripped. */
  main: string;
  /** Where in the building, sentence-cased. Empty string when not stated. */
  location: string;
}

/**
 * Strip the legal citation off an HPD violation description and split the
 * apartment/room location out of the prose.
 *
 * The citation prefix has no consistent format, so this walks the description
 * word by word and cuts at the first HPD action verb. Failing that, it cuts at
 * the first substantive non-citation word after citation material has appeared.
 * If neither fires, the description is returned whole — never truncated on a
 * guess.
 *
 * @param rawDesc - The `novdescription` (or `novtype`) field.
 * @returns The cleaned description and location.
 *
 * @example
 * cleanDescription('§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER. IN THE BATHROOM LOCATED AT APT 4B')
 * // => { main: 'Repair the broken plaster.', location: 'In the bathroom located at Apt 4B' }
 */
export function cleanDescription(rawDesc: string | null | undefined): CleanedDescription {
  if (!rawDesc) return { main: 'No description available', location: '' };
  const working = rawDesc.trim();

  const tokens = [...working.matchAll(/\S+/g)].map((m) => ({ text: m[0], index: m.index }));

  let descriptionStart = -1;
  let passedCitationMaterial = false;

  for (const [i, token] of tokens.entries()) {
    const cleaned = normalizeToken(token.text);

    if (/[\d§():]/.test(token.text) || CITATION_WORDS.has(cleaned)) {
      passedCitationMaterial = true;
    }

    // HPD sometimes runs the citation straight into the verb with a colon and
    // no space: "(A) § HMC:FILE ANNUAL BEDBUG REPORT". Anchor after the colon
    // so the verb survives.
    const colon = token.text.lastIndexOf(':');
    if (colon !== -1 && colon < token.text.length - 1) {
      if (HPD_ACTION_VERBS.has(normalizeToken(token.text.slice(colon + 1)))) {
        descriptionStart = token.index + colon + 1;
        break;
      }
    }

    if (HPD_ACTION_VERBS.has(cleaned)) {
      descriptionStart = token.index;
      break;
    }

    // Fallback for descriptions with no action verb at all ("OWNER FAILED TO
    // FILE A VALID REGISTRATION STATEMENT"). Two guards keep it from firing
    // inside a citation: tokens of two letters or fewer are HPD shorthand, not
    // prose, and a citation reference just ahead means the citation is still
    // running.
    if (
      passedCitationMaterial &&
      cleaned.length > 2 &&
      /^[a-zA-Z]+$/.test(cleaned) &&
      !CITATION_WORDS.has(cleaned) &&
      !citationFollows(tokens, i + 1)
    ) {
      descriptionStart = token.index;
      break;
    }
  }

  let description = descriptionStart > 0 ? working.substring(descriptionStart).trim() : working;
  description = description.replace(/^[\s:;,\-.]+/, '');

  let main = description;
  let location = '';

  // "…plaster. In the bathroom located at apt 4B" — room and address together.
  const fullLocMatch = description.match(/\.\s+(in\s+(?:the\s+)?\w[\w\s]*?(?:located\s+at\s+.+))$/i);
  if (fullLocMatch?.index !== undefined && fullLocMatch[1]) {
    main = description.substring(0, fullLocMatch.index + 1).trim();
    location = fullLocMatch[1].trim();
  } else {
    const simpleLocMatch = description.match(/\.?\s*(located\s+at\s+.+)$/i);
    if (simpleLocMatch?.index !== undefined && simpleLocMatch[1]) {
      main = description.substring(0, simpleLocMatch.index).trim();
      // A room clause can dangle in front of "located at" — keep both.
      const danglingRoom = main.match(/\.\s+(in\s+(?:the\s+)?\w[\w\s]*)$/i);
      if (danglingRoom?.index !== undefined && danglingRoom[1]) {
        const roomText = danglingRoom[1].trim();
        main = main.substring(0, danglingRoom.index + 1).trim();
        location = roomText + ' — ' + simpleLocMatch[1].trim();
      } else {
        location = simpleLocMatch[1].trim();
      }
    } else {
      const trailingRoom = main.match(/\.\s+(in\s+(?:the\s+)?\w[\w\s]*)$/i);
      if (trailingRoom?.index !== undefined && trailingRoom[1] && trailingRoom[1].split(/\s+/).length <= 6) {
        location = trailingRoom[1].trim();
        main = main.substring(0, trailingRoom.index + 1).trim();
      }
    }
  }

  main = main.replace(/[\s:;,\-]+$/, '');

  return {
    main: toSentenceCase(main),
    location: location ? toSentenceCase(location) : '',
  };
}

/**
 * Turn one raw Socrata violation record into a readable, typed violation.
 *
 * Pure and synchronous — no network, no DOM. Every field upstream may omit
 * comes back as `null` rather than `undefined` or an empty string, and the
 * original record is preserved on `raw`.
 *
 * Unlike bare {@link translateStatus}, this trusts HPD's `violationstatus`
 * flag for the open/closed call and uses `currentstatus` only for the label.
 * That matters for `VIOLATION WILL BE REINSPECTED`, where the status text
 * alone genuinely does not say whether the violation is still open. A
 * dismissal is never overridden — `dismissed` is a distinction Socrata's
 * two-value flag cannot express.
 *
 * @param raw - A violation record from dataset `wvxf-dwi5`.
 * @returns The parsed violation.
 *
 * @example
 * const parsed = parseViolation(rawRecord);
 * console.log(parsed.status.label, '—', parsed.description);
 */
export function parseViolation(raw: RawViolation): ParsedViolation {
  const { main, location } = cleanDescription(raw.novdescription ?? raw.novtype);
  const classLetter = (raw.class ?? '').toUpperCase().trim();
  const violationClass = isViolationClass(classLetter) ? classLetter : null;

  const status = translateStatus(raw.currentstatus);
  const flagged = readViolationStatus(raw.violationstatus);
  const state: ViolationState = status.state === 'dismissed' ? 'dismissed' : flagged ?? status.state;

  return {
    id: nonEmpty(raw.violationid),
    description: main,
    location,
    status: state === status.state ? status : { ...status, state },
    class: violationClass,
    severity: violationClass ? CLASS_SEVERITY[violationClass] : null,
    rentImpairing: readYesNo(raw.rentimpairing),
    apartment: nonEmpty(raw.apartment),
    inspectionDate: nonEmpty(raw.inspectiondate),
    bbl: nonEmpty(raw.bbl),
    raw,
  };
}

/** HPD writes this flag as "Open" or "Close". */
function readViolationStatus(value: string | undefined): ViolationState | null {
  const upper = value?.trim().toUpperCase();
  if (!upper) return null;
  if (upper.startsWith('CLOSE')) return 'closed';
  if (upper.startsWith('OPEN')) return 'open';
  return null;
}

function readYesNo(value: string | undefined): boolean | null {
  const upper = value?.trim().toUpperCase();
  if (upper === 'Y' || upper === 'YES' || upper === 'TRUE') return true;
  if (upper === 'N' || upper === 'NO' || upper === 'FALSE') return false;
  return null;
}

/** Strip leading and trailing non-letters, then lowercase. */
function normalizeToken(token: string): string {
  return token.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
}

/**
 * Does a citation reference appear in the next few tokens?
 *
 * A section symbol or a code-shaped number (`27-2005`, `703.1.3`, `D26-19.01`)
 * means the citation has not finished, so a plain word ahead of one is part of
 * the citation rather than the start of the description. Bare numbers do not
 * count — "40 WATTS" and "2 COATS" are ordinary HPD prose.
 */
function citationFollows(tokens: { text: string }[], from: number, lookahead = 3): boolean {
  return tokens
    .slice(from, from + lookahead)
    .some((t) => t.text.includes('§') || /\d+[-.]\d/.test(t.text));
}

function isViolationClass(value: string): value is ViolationClass {
  return value === 'A' || value === 'B' || value === 'C' || value === 'I';
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
