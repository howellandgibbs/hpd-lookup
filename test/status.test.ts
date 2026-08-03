import { describe, expect, it } from 'vitest';
import { STATUS_MAP, normalizeStatusKey, translateStatus } from '../src/status.js';
import fixtures from './fixtures/violations.json' with { type: 'json' };
import type { RawViolation } from '../src/types.js';

describe('translateStatus', () => {
  it('handles missing input without throwing', () => {
    expect(translateStatus(undefined)).toEqual({
      label: 'Status unknown',
      state: 'open',
      raw: '',
      known: false,
    });
    expect(translateStatus('   ').label).toBe('Status unknown');
  });

  it('translates known codes to hand-written labels', () => {
    const result = translateStatus('VIOLATION OPEN');
    expect(result.label).toBe('Open — landlord has not fixed it yet');
    expect(result.state).toBe('open');
    expect(result.known).toBe(true);
  });

  it('preserves the raw status for callers who need it', () => {
    expect(translateStatus('NOV SENT OUT').raw).toBe('NOV SENT OUT');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(translateStatus('  violation closed  ').label).toBe(STATUS_MAP['VIOLATION CLOSED']!.label);
  });

  it("matches HPD's inconsistent hyphen spacing", () => {
    // Live data contains "RE- INSPECT" with a space; the map key has none.
    const spaced = translateStatus('FIRST NO ACCESS TO RE- INSPECT VIOLATION');
    const unspaced = translateStatus('FIRST NO ACCESS TO RE-INSPECT VIOLATION');
    expect(spaced.known).toBe(true);
    expect(spaced.label).toBe(unspaced.label);
  });

  it('keeps rejected certifications open, despite the word "invalid"', () => {
    expect(translateStatus('INVALID CERTIFICATION').state).toBe('open');
    expect(translateStatus('FALSE CERTIFICATION').state).toBe('open');
  });

  it('marks dismissals as dismissed, not closed', () => {
    expect(translateStatus('VIOLATION DISMISSED').state).toBe('dismissed');
  });

  it('falls back to a heuristic for unrecognized codes', () => {
    const result = translateStatus('SOME NEW HPD STATUS');
    expect(result.known).toBe(false);
    expect(result.label).toBe('Some new HPD status');
    expect(result.state).toBe('open');
  });

  it('guesses closed and dismissed states in the fallback path', () => {
    expect(translateStatus('SOMETHING CLOSED SOMEHOW').state).toBe('closed');
    expect(translateStatus('SOMETHING DISMISSED SOMEHOW').state).toBe('dismissed');
  });

  it('recognizes every status code present in the live dataset', () => {
    const unknown = (fixtures as RawViolation[])
      .map((v) => v.currentstatus ?? '')
      .filter((s) => !translateStatus(s).known);
    expect(unknown).toEqual([]);
  });
});

describe('normalizeStatusKey', () => {
  it('collapses whitespace and hyphen spacing', () => {
    expect(normalizeStatusKey('  first no access to re- inspect  violation ')).toBe(
      'FIRST NO ACCESS TO RE-INSPECT VIOLATION',
    );
  });
});
