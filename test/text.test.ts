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

  // Units that lead with a letter. Every example below is from live records.
  describe('letter-led apartment units', () => {
    it('uppercases a unit that starts with a letter', () => {
      expect(toSentenceCase('LOCATED AT APT B510, 5TH STORY')).toBe('Located at Apt B510, 5th story');
      expect(toSentenceCase('LOCATED AT APT C4, 3RD STORY')).toBe('Located at Apt C4, 3rd story');
    });

    it('handles two leading or trailing letters', () => {
      expect(toSentenceCase('AT APT PH23')).toBe('At Apt PH23');
      expect(toSentenceCase('AT APT LL1')).toBe('At Apt LL1');
      expect(toSentenceCase('AT APT 2FL')).toBe('At Apt 2FL');
    });

    it('leaves ordinals alone, because "apt 2nd room" means the second room', () => {
      expect(toSentenceCase('LOCATED AT APT 2ND ROOM')).toBe('Located at apt 2nd room');
    });

    it('leaves ordinary words after "apt" alone', () => {
      // HPD writes "APT TO PUBLIC HALL"; the words after "apt" include "to", "no" and "in".
      expect(toSentenceCase('LOCATED AT APT TO PUBLIC HALL')).toBe('Located at apt to public hall');
    });

    it('does not capitalise a prefix mid-word', () => {
      expect(toSentenceCase('LOCATED AT BSMT-APT S3')).toBe('Located at bsmt-apt S3');
      expect(toSentenceCase('LOCATED AT BSMT-APT 1G')).toBe('Located at bsmt-apt 1G');
    });
  });

  // HPD runs the designator into the number with no space. These were all
  // taken from live records.
  describe('run-together unit designators', () => {
    it('uppercases them', () => {
      expect(toSentenceCase('LOCATED AT APT1RB LOWER LEVEL')).toBe('Located at APT1RB lower level');
      expect(toSentenceCase('AT GF1')).toBe('At GF1');
      expect(toSentenceCase('AT APT44, 4TH STORY')).toBe('At APT44, 4th story');
    });

    it('leaves measurements alone', () => {
      // A lead-paint reading, not an apartment. Uppercasing it reads as nonsense.
      expect(toSentenceCase('LEAD LEVEL OF 0.5MG/CM2 FOUND')).toBe('Lead level of 0.5mg/cm2 found');
    });

    it('leaves ordinary words that end in a number alone', () => {
      expect(toSentenceCase('DEFECTIVE MATERIAL4TH FLOOR')).toBe('Defective material4th floor');
    });

    it('leaves ordinals alone', () => {
      expect(toSentenceCase('IN THE 2ND ROOM FROM NORTH')).toBe('In the 2nd room from north');
    });
  });
});
