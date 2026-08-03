import { describe, expect, it } from 'vitest';
import { cleanDescription, parseViolation } from '../src/parse.js';
import fixtures from './fixtures/violations.json' with { type: 'json' };
import type { RawViolation } from '../src/types.js';

const records = fixtures as RawViolation[];

describe('cleanDescription', () => {
  it('reports missing descriptions rather than returning an empty string', () => {
    expect(cleanDescription('')).toEqual({ main: 'No description available', location: '' });
    expect(cleanDescription(null).main).toBe('No description available');
  });

  it('strips a section-symbol citation and anchors on the action verb', () => {
    const { main } = cleanDescription('§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER');
    expect(main).toBe('Repair the broken plaster');
  });

  it('strips a citation with no section symbol', () => {
    const { main } = cleanDescription('HMC ADM CODE 27-2017.4 ABATE THE INFESTATION OF MICE');
    expect(main).toBe('Abate the infestation of mice');
  });

  it('splits a "located at" clause into the location field', () => {
    const { main, location } = cleanDescription(
      '§ 27-2005 ADM CODE REPLACE THE MISSING SMOKE DETECTOR LOCATED AT APT 4B',
    );
    expect(main).toBe('Replace the missing smoke detector');
    expect(location).toBe('Located at Apt 4B');
  });

  it('keeps a room clause together with the address clause', () => {
    const { main, location } = cleanDescription(
      '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER. IN THE BATHROOM LOCATED AT APT 4B',
    );
    expect(main).toBe('Repair the broken plaster.');
    expect(location).toBe('In the bathroom located at Apt 4B');
  });

  it('joins a room clause and address clause that HPD split with a period', () => {
    const { main, location } = cleanDescription(
      '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER. IN THE BATHROOM. LOCATED AT APT 4B',
    );
    expect(main).toBe('Repair the broken plaster.');
    expect(location).toBe('In the bathroom — located at Apt 4B');
  });

  it('pulls a short trailing room clause out on its own', () => {
    const { main, location } = cleanDescription('§ 27-2005 ADM CODE PAINT THE CEILING. IN THE KITCHEN');
    expect(main).toBe('Paint the ceiling.');
    expect(location).toBe('In the kitchen');
  });

  it('leaves a long trailing clause in the description', () => {
    const { location } = cleanDescription(
      'REPAIR THE WALL. IN THE HALLWAY NEAR THE STAIRS BY THE FRONT ENTRANCE DOOR',
    );
    expect(location).toBe('');
  });

  it('returns the description whole when nothing looks like a citation', () => {
    expect(cleanDescription('BROKEN WINDOW').main).toBe('Broken window');
  });

  // The cases below are verbatim from live HPD records. Each one was parsed
  // wrongly by the original implementation; the comment says how.
  describe('real records that used to parse wrongly', () => {
    it('keeps a verb that HPD glued to the citation with a colon', () => {
      // Lost the leading "File", leaving "Annual bedbug report…".
      const { main } = cleanDescription(
        '(A) § HMC:FILE ANNUAL BEDBUG REPORT IN ACCORDANCE WITH HPD RULE AS DESCRIBED ON THE BACK OF THIS NOTICE OF VIOLATION',
      );
      expect(main).toMatch(/^File annual bedbug report/);
    });

    it('keeps a verb glued to a multi-section citation', () => {
      // Lost the leading "Provide".
      const { main } = cleanDescription(
        '§ 27-2005, 2044 HMC:PROVIDE APPROVED ONE-HOUR FIRE RESISTANCE RATED SELF-CLOSING DOOR AT ALL OPENINGS TO PUBLIC HALL',
      );
      expect(main).toMatch(/^Provide approved one-hour fire resistance/);
    });

    it('drops HPD shorthand that is not part of the description', () => {
      // Began "Aw provide adequate lighting…".
      const { main } = cleanDescription(
        'D26-19.01 ADM CODE AW PROVIDE ADEQUATE LIGHTING AT REAR YARD 40 WATTS MINIMUM REQUIRED.',
      );
      expect(main).toBe('Provide adequate lighting at rear yard 40 watts minimum required.');
    });

    it('does not cut inside a run of citations', () => {
      // Cut at "FIRE", leaving "Fire code § 703.1.3; NYC fire code § 703.2: adjust door…".
      const { main } = cleanDescription(
        '28 RCNY § 25-171; & 67 (7)(B) MDL; NYC FIRE CODE § 703.1.3; NYC FIRE CODE § 703.2: ADJUST DOOR TO PREVENT GAPS BETWEEN THE TOP AND SIDE EDGES OF DOOR',
      );
      expect(main).toMatch(/^Adjust door to prevent gaps/);
    });

    it('still starts at a non-verb when that is the real beginning', () => {
      // Guard on the fix above: this description has no action verb up front,
      // and the later "FILE" must not be mistaken for the start.
      const { main } = cleanDescription(
        '§27-2107 ADM CODE OWNER FAILED TO FILE A VALID REGISTRATION STATEMENT WITH THE DEPARTMENT',
      );
      expect(main).toMatch(/^Owner failed to file a valid registration statement/);
    });

    it('does not treat ordinary numbers in prose as citation material', () => {
      const { main } = cleanDescription(
        '§ 27-2014 ADM CODE AND DEPT. RULES AND REGULATIONS. SCRAPE AND REMOVE RUST SCALES AND PAINT WITH 2 COATS OF PAINT',
      );
      expect(main).toBe('Scrape and remove rust scales and paint with 2 coats of paint');
    });

    it('handles a citation with subdivision letters in parentheses', () => {
      const { main } = cleanDescription(
        '§ 27-2045(B)(1)(A) HMC, § 12-01, § 12-03 RCNY REPAIR, REPLACE OR PROVIDE AN APPROVED AND OPERATIONAL SMOKE DETECTING DEVICE',
      );
      expect(main).toMatch(/^Repair, replace or provide an approved and operational smoke detecting device/);
    });
  });

  it('never returns an empty description for any live record', () => {
    for (const record of records) {
      const { main } = cleanDescription(record.novdescription ?? record.novtype);
      expect(main.length, `empty parse for ${record.violationid}`).toBeGreaterThan(0);
    }
  });
});

describe('parseViolation', () => {
  it('parses a full record', () => {
    const parsed = parseViolation({
      violationid: '12345',
      novdescription: '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER LOCATED AT APT 4B',
      currentstatus: 'VIOLATION OPEN',
      violationstatus: 'Open',
      class: 'C',
      apartment: '4B',
      inspectiondate: '2026-08-02T00:00:00.000',
      bbl: '3038250043',
      rentimpairing: 'Y',
    });

    expect(parsed.id).toBe('12345');
    expect(parsed.description).toBe('Repair the broken plaster');
    expect(parsed.location).toBe('Located at Apt 4B');
    expect(parsed.status.label).toBe('Open — landlord has not fixed it yet');
    expect(parsed.class).toBe('C');
    expect(parsed.severity).toBe('Immediately hazardous');
    expect(parsed.rentImpairing).toBe(true);
    expect(parsed.apartment).toBe('4B');
    expect(parsed.bbl).toBe('3038250043');
  });

  it('nulls out fields upstream omitted, rather than inventing empty strings', () => {
    const parsed = parseViolation({});
    expect(parsed.id).toBeNull();
    expect(parsed.class).toBeNull();
    expect(parsed.severity).toBeNull();
    expect(parsed.apartment).toBeNull();
    expect(parsed.bbl).toBeNull();
    expect(parsed.rentImpairing).toBeNull();
    expect(parsed.inspectionDate).toBeNull();
  });

  it('ignores a violation class HPD does not define', () => {
    expect(parseViolation({ class: 'Z' }).class).toBeNull();
  });

  it('falls back to novtype when there is no description', () => {
    expect(parseViolation({ novtype: 'BROKEN WINDOW' }).description).toBe('Broken window');
  });

  it("prefers HPD's own open/close flag over the status wording", () => {
    // This status is genuinely ambiguous — live records split roughly 57/43.
    const closed = parseViolation({
      currentstatus: 'VIOLATION WILL BE REINSPECTED',
      violationstatus: 'Close',
    });
    expect(closed.status.state).toBe('closed');
    expect(closed.status.label).toBe('Awaiting HPD re-inspection');

    const open = parseViolation({
      currentstatus: 'VIOLATION WILL BE REINSPECTED',
      violationstatus: 'Open',
    });
    expect(open.status.state).toBe('open');
  });

  it('does not let the open/close flag overwrite a dismissal', () => {
    const parsed = parseViolation({ currentstatus: 'VIOLATION DISMISSED', violationstatus: 'Close' });
    expect(parsed.status.state).toBe('dismissed');
  });

  it('keeps the original record intact', () => {
    const raw: RawViolation = { violationid: '1', nta: 'BK75' };
    expect(parseViolation(raw).raw).toBe(raw);
  });

  it("agrees with HPD's open/close flag across every live fixture", () => {
    for (const record of records) {
      const parsed = parseViolation(record);
      if (parsed.status.state === 'dismissed') continue;
      const expected = record.violationstatus?.toUpperCase().startsWith('CLOSE') ? 'closed' : 'open';
      expect(parsed.status.state, `${record.violationid} (${record.currentstatus})`).toBe(expected);
    }
  });
});
