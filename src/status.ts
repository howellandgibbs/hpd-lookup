import type { TranslatedStatus, ViolationState } from './types.js';
import { toSentenceCase } from './text.js';

/**
 * HPD's status codes, mapped to what they mean for a tenant.
 *
 * Every code HPD currently emits in dataset `wvxf-dwi5` is covered here. The
 * `state` for each was taken from HPD's own `violationstatus` flag, not from
 * guessing at the wording: for all but one code, one side accounts for
 * >99% of records. The exception is `VIOLATION WILL BE REINSPECTED`, which
 * splits roughly 57/43 — {@link parseViolation} resolves that per record from
 * `violationstatus`.
 *
 * Two entries are worth reading twice, because the plain wording points the
 * wrong way: an *invalid* or *false* certification means the landlord said the
 * work was done and HPD disagreed, so the violation is still open.
 */
export const STATUS_MAP: Readonly<Record<string, { label: string; state: ViolationState }>> = {
  // Resolved and removed
  'VIOLATION CLOSED': { label: 'Resolved — HPD closed this violation', state: 'closed' },
  'VIOLATION DISMISSED': { label: 'Dismissed by HPD', state: 'dismissed' },

  // Notice stage
  'NOV SENT OUT': { label: 'Notice sent to landlord', state: 'open' },
  'INFO NOV SENT OUT': { label: 'Informational notice sent to landlord', state: 'open' },
  'NOTICE OF ISSUANCE SENT TO TENANT': { label: 'Tenant notified of violation', state: 'open' },
  'DEFECT LETTER ISSUED': { label: 'Defect letter issued to landlord', state: 'open' },
  'VIOLATION OPEN': { label: 'Open — landlord has not fixed it yet', state: 'open' },
  'VIOLATION REOPEN': { label: 'Reopened — the problem came back', state: 'open' },

  // Deadline passed
  'NOT COMPLIED WITH': { label: 'Landlord missed the deadline to fix it', state: 'open' },

  // Landlord certification
  'NOV CERTIFIED ON TIME': { label: 'Landlord certified it fixed, on time', state: 'open' },
  'NOV CERTIFIED LATE': { label: 'Landlord certified it fixed, after the deadline', state: 'open' },
  'INVALID CERTIFICATION': { label: 'Landlord’s certification was rejected by HPD', state: 'open' },
  'FALSE CERTIFICATION': { label: 'Landlord certified it fixed, but HPD found it was not', state: 'open' },
  'CERTIFICATION POSTPONMENT GRANTED': { label: 'Certification deadline extended', state: 'open' },
  'CERTIFICATION POSTPONMENT DENIED': { label: 'Landlord’s request for more time was denied', state: 'open' },

  // Re-inspection
  'VIOLATION WILL BE REINSPECTED': { label: 'Awaiting HPD re-inspection', state: 'open' },
  'FIRST NO ACCESS TO RE-INSPECT VIOLATION': {
    label: 'HPD could not get in to re-inspect (first attempt)',
    state: 'open',
  },
  'SECOND NO ACCESS TO RE-INSPECT VIOLATION': {
    label: 'HPD could not get in to re-inspect (second attempt)',
    state: 'open',
  },
  'COMPLIED IN ACCESS AREA': { label: 'Fixed in the area HPD could reach', state: 'open' },
  'DOWNGRADE PENDING INSPECTION': { label: 'Severity may be lowered, pending inspection', state: 'open' },

  // Lead paint
  'LEAD DOCS SUBMITTED, ACCEPTABLE': { label: 'Lead paint paperwork accepted by HPD', state: 'open' },
  'LEAD DOCS SUBMITTED, NOT ACCEPTABLE': { label: 'Lead paint paperwork rejected by HPD', state: 'open' },

  // Court
  'CIV14 MAILED': { label: 'Court action initiated', state: 'open' },

  // Historical codes, retired upstream but still present in older records.
  'FIRST NOTICE OF VIOLATION SENT': { label: 'Notice sent to landlord', state: 'open' },
  'NOV CERTIFIED': { label: 'Landlord certified it fixed (not re-inspected)', state: 'open' },
  CLOSED: { label: 'Resolved — HPD closed this violation', state: 'closed' },
  INVALID: { label: 'Marked invalid', state: 'dismissed' },
};

/**
 * Canonicalize a raw status for lookup.
 *
 * HPD is inconsistent about spacing around hyphens — the live data contains
 * `FIRST NO ACCESS TO RE- INSPECT VIOLATION` (space after the hyphen) but
 * `SECOND NO ACCESS TO RE-INSPECT VIOLATION` (none). Normalizing means one
 * map entry covers both spellings.
 *
 * @internal
 */
export function normalizeStatusKey(rawStatus: string): string {
  return rawStatus
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Translate an HPD status code into plain English.
 *
 * Known codes get a hand-written label. Unknown codes fall back to sentence
 * case, with a coarse state guess from the words "clos" and "dismiss";
 * `known: false` marks those so a caller can hedge the wording.
 *
 * This function sees only the status string. When you have the whole record,
 * prefer {@link parseViolation}, which additionally trusts HPD's own
 * `violationstatus` flag for the open/closed call.
 *
 * @param rawStatus - The `currentstatus` field from a violation record.
 * @returns The translated status. Never throws; empty input yields
 *          `{ label: 'Status unknown', state: 'open', known: false }`.
 *
 * @example
 * translateStatus('INVALID CERTIFICATION')
 * // => { label: 'Landlord’s certification was rejected by HPD', state: 'open', … }
 */
export function translateStatus(rawStatus: string | null | undefined): TranslatedStatus {
  const raw = rawStatus ?? '';
  if (!raw.trim()) {
    return { label: 'Status unknown', state: 'open', raw, known: false };
  }

  const mapped = STATUS_MAP[normalizeStatusKey(raw)];
  if (mapped) {
    return { label: mapped.label, state: mapped.state, raw, known: true };
  }

  const upper = raw.toUpperCase();
  return {
    label: toSentenceCase(raw),
    state: upper.includes('DISMISS') ? 'dismissed' : upper.includes('CLOS') ? 'closed' : 'open',
    raw,
    known: false,
  };
}
