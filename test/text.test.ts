import { describe, expect, it } from 'vitest';
import { toSentenceCase } from '../src/text.js';

describe('toSentenceCase', () => {
  it('returns an empty string for empty input', () => {
    expect(toSentenceCase('')).toBe('');
    expect(toSentenceCase(null)).toBe('');
    expect(toSentenceCase(undefined)).toBe('');
  });

  it('sentence-cases all-caps prose', () => {
    expect(toSentenceCase('REPAIR THE BROKEN PLASTER')).toBe('Repair the broken plaster');
  });

  it('capitalizes after sentence-ending punctuation', () => {
    expect(toSentenceCase('FIX THE LEAK. REPLACE THE PIPE')).toBe('Fix the leak. Replace the pipe');
    expect(toSentenceCase('IS IT FIXED? NO IT IS NOT')).toBe('Is it fixed? No it is not');
  });

  it('keeps agency and legal acronyms uppercase', () => {
    expect(toSentenceCase('PER HMC AND MDL, NOTIFY HPD')).toBe('Per HMC and MDL, notify HPD');
    expect(toSentenceCase('FILE WITH DOB AND FDNY')).toBe('File with DOB and FDNY');
  });

  it('title-cases unit prefixes and uppercases the unit itself', () => {
    expect(toSentenceCase('IN APT 4b')).toBe('In Apt 4B');
    expect(toSentenceCase('ON FLOOR 2')).toBe('On Floor 2');
  });

  it('uppercases bare unit designators', () => {
    expect(toSentenceCase('THE PROBLEM IS IN 12c')).toBe('The problem is in 12C');
  });

  it('leaves Roman numerals alone', () => {
    expect(toSentenceCase('CLASS III VIOLATION')).toBe('Class III violation');
  });
});
