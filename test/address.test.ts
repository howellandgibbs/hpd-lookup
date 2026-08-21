import { describe, expect, it } from 'vitest';
import { formatAddress } from '../src/address.js';

// Every string below is a real label returned by GeoSearch for a real NYC
// address. They were collected by querying the live autocomplete endpoint,
// because the interesting cases are all ones nobody would think to invent.
describe('formatAddress', () => {
  it('returns an empty string for empty input', () => {
    expect(formatAddress('')).toBe('');
    expect(formatAddress(null)).toBe('');
    expect(formatAddress(undefined)).toBe('');
  });

  it('title-cases the shouted street and leaves the rest alone', () => {
    // Sentence-casing this one used to return it entirely lower case, because
    // the first character is a digit and there is no sentence to open.
    expect(formatAddress('1742 EAST 172 STREET, Bronx, NY, USA')).toBe(
      '1742 East 172 Street, Bronx, NY, USA',
    );
    expect(formatAddress('250 OCEAN PARKWAY, Brooklyn, NY, USA')).toBe(
      '250 Ocean Parkway, Brooklyn, NY, USA',
    );
  });

  it('keeps NY and USA upper case', () => {
    expect(formatAddress('100 GOLD STREET, New York, NY, USA')).toBe(
      '100 Gold Street, New York, NY, USA',
    );
  });

  it('lowercases joining words inside a street name', () => {
    expect(formatAddress('1 AVENUE OF THE AMERICAS, New York, NY, USA')).toBe(
      '1 Avenue of the Americas, New York, NY, USA',
    );
  });

  it('capitalizes an article that follows the house number', () => {
    // Otherwise the rule above turns "1 The Bowery" into "1 the Bowery".
    expect(formatAddress('1 THE BOWERY, New York, NY, USA')).toBe(
      '1 The Bowery, New York, NY, USA',
    );
  });

  it('handles Mc names', () => {
    expect(formatAddress('350 MCDONALD AVENUE, Brooklyn, NY, USA')).toBe(
      '350 McDonald Avenue, Brooklyn, NY, USA',
    );
    expect(formatAddress('30 MCGUINNESS BOULEVARD, Brooklyn, NY, USA')).toBe(
      '30 McGuinness Boulevard, Brooklyn, NY, USA',
    );
  });

  it('leaves Mac names as plain title case', () => {
    // These four are all real HPD street names sitting next to each other in
    // the dataset. No rule separates MacDougal from Macy, so none of them get
    // the Mc treatment -- "MacY Place" would be worse than "Macy Place".
    expect(formatAddress('1 MACON STREET, Brooklyn, NY, USA')).toBe(
      '1 Macon Street, Brooklyn, NY, USA',
    );
    expect(formatAddress('1 MACY PLACE, Bronx, NY, USA')).toBe('1 Macy Place, Bronx, NY, USA');
    expect(formatAddress('1 MACE AVENUE, Bronx, NY, USA')).toBe('1 Mace Avenue, Bronx, NY, USA');
    expect(formatAddress('1 MACDOUGAL STREET, New York, NY, USA')).toBe(
      '1 Macdougal Street, New York, NY, USA',
    );
  });

  it('leaves a spaced Mc name spaced', () => {
    // HPD writes it both ways -- "MC DONALD AVENUE" and "MCDONALD AVENUE" are
    // both in the data. Casing is ours to fix; joining the words is not.
    expect(formatAddress('1 MC GUINNESS BOULEVARD, Brooklyn, NY, USA')).toBe(
      '1 Mc Guinness Boulevard, Brooklyn, NY, USA',
    );
  });

  it('passes HPD data-entry junk through untouched apart from case', () => {
    // Real record. Not our job to guess what was meant.
    expect(formatAddress('1 ST MARKS AVENUEDUMMY, Brooklyn, NY, USA')).toBe(
      '1 St Marks Avenuedummy, Brooklyn, NY, USA',
    );
  });

  it('capitalizes one letter per apostrophized word', () => {
    expect(formatAddress("1 SAINT MARK'S PLACE, New York, NY, USA")).toBe(
      "1 Saint Mark's Place, New York, NY, USA",
    );
  });

  it('leaves hyphenated house numbers alone and title-cases hyphenated names', () => {
    expect(formatAddress('110-50 SUTPHIN BOULEVARD, Jamaica, NY, USA')).toBe(
      '110-50 Sutphin Boulevard, Jamaica, NY, USA',
    );
    expect(formatAddress('BEDFORD-STUYVESANT BUILDING 1, Brooklyn, NY, USA')).toBe(
      'Bedford-Stuyvesant Building 1, Brooklyn, NY, USA',
    );
  });

  it('leaves fractional house numbers alone', () => {
    expect(formatAddress('135 1/2 BAY RIDGE AVENUE, Brooklyn, NY, USA')).toBe(
      '135 1/2 Bay Ridge Avenue, Brooklyn, NY, USA',
    );
    expect(formatAddress('47 1/2 EAST 1 STREET, New York, NY, USA')).toBe(
      '47 1/2 East 1 Street, New York, NY, USA',
    );
  });

  it('lowercases ordinal suffixes', () => {
    expect(formatAddress('1 EAST 1ST STREET, New York, NY, USA')).toBe(
      '1 East 1st Street, New York, NY, USA',
    );
  });

  it('handles a single-letter word', () => {
    expect(formatAddress('10 O BRIEN PLACE, Brooklyn, NY, USA')).toBe(
      '10 O Brien Place, Brooklyn, NY, USA',
    );
  });

  it('is idempotent', () => {
    const once = formatAddress('1742 EAST 172 STREET, Bronx, NY, USA');
    expect(formatAddress(once)).toBe(once);
  });
});
