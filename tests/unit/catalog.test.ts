import { describe, expect, it } from 'vitest';
import { GAME_DEFINITION, DEF } from '../../src/data/definition';
import { validateDefinition } from '../../src/data/validate';

describe('GameDefinition catalogs', () => {
  it('REQ-DATA-01 validates with no missing references', () => {
    expect(validateDefinition(GAME_DEFINITION)).toEqual([]);
  });
  it('REQ-DATA-02 has the locked content scope', () => {
    const d = GAME_DEFINITION;
    expect([d.rooms.length, d.diseases.length, d.roles.length, d.skills.length, d.trainings.length, d.projects.length, d.missions.length, d.events.length, d.chapters.length]).toEqual([18, 24, 9, 12, 12, 12, 12, 12, 5]);
  });
  it('REQ-DATA-03 room catalogue matches the specification table', () => {
    const t: [string, number, number, number, number, number, number][] = [
      ['R01', 3, 3, 2000, 120, 80, 1], ['R02', 3, 3, 1000, 100, 80, 1], ['R03', 4, 4, 3000, 200, 120, 1], ['R04', 4, 4, 4000, 250, 180, 2],
      ['R05', 4, 4, 3500, 220, 150, 1], ['R06', 4, 4, 2500, 150, 100, 1], ['R07', 5, 5, 7000, 300, 250, 2], ['R08', 5, 5, 10000, 400, 400, 3],
      ['R09', 5, 5, 8000, 350, 350, 3], ['R10', 5, 5, 9000, 350, 350, 3], ['R11', 4, 4, 5000, 250, 180, 2], ['R12', 3, 3, 2000, 150, 100, 2],
      ['R13', 6, 6, 18000, 550, 700, 4], ['R14', 6, 5, 12000, 350, 450, 4], ['R15', 6, 5, 16000, 500, 800, 4], ['R16', 5, 5, 14000, 450, 450, 5],
      ['R17', 6, 6, 17000, 500, 750, 5], ['R18', 6, 6, 20000, 600, 900, 5],
    ];
    for (const [id, w, h, base, tile, op, ch] of t) {
      const r = DEF.room[id as 'R01'];
      expect([r.minW, r.minH, r.baseCost, r.costPerTile, r.baseOperation, r.unlockChapter], id).toEqual([w, h, base, tile, op, ch]);
    }
  });
  it('REQ-DATA-04 disease catalogue matches revenue/material/triage/path', () => {
    const t: Record<string, [number, string, number, number, number]> = {
      D01: [1, 'U>B', 350, 20, 1], D02: [1, 'U>B', 450, 30, 2], D03: [1, 'U>B', 550, 45, 2], D04: [2, 'U>P>L>B', 800, 80, 2],
      D05: [3, 'U>X>O', 1700, 180, 3], D06: [2, 'U>P>L>B', 1000, 100, 3], D07: [4, 'E>P>L>OP>V', 3600, 550, 5], D08: [4, 'U>X>V', 2100, 260, 4],
      D09: [1, 'U>B', 400, 25, 1], D10: [5, 'U>X>EX', 2600, 300, 3], D11: [3, 'U>O', 1200, 100, 2], D12: [1, 'U>B', 450, 30, 1],
      D13: [2, 'U>P>L>B', 900, 85, 2], D14: [5, 'U>P>L>EX', 2400, 280, 3], D15: [3, 'U>X>O', 1800, 170, 3], D16: [2, 'U>B', 500, 40, 1],
      D17: [2, 'U>P>L>B', 950, 90, 2], D18: [5, 'U>EX', 2300, 250, 3], D19: [5, 'U>P>L>EX', 3400, 400, 4], D20: [5, 'U>X>EX', 3800, 450, 4],
      D21: [5, 'E>X>RB', 4000, 600, 5], D22: [5, 'U>P>L>EX', 3700, 500, 4], D23: [5, 'U>P>L>RB', 3900, 550, 4], D24: [5, 'U>P>L>RB', 3500, 420, 4],
    };
    for (const [id, [ch, path, rev, mat, tri]] of Object.entries(t)) {
      const d = DEF.disease[id as 'D01'];
      expect([d.chapter, d.path.join('>'), d.revenue, d.material, d.triage], id).toEqual([ch, path, rev, mat, tri]);
    }
    expect(DEF.disease.D02.pharmacyPath).toEqual(['U', 'A']);
  });
  it('REQ-DATA-05 research thresholds, start state and project costs', () => {
    expect(GAME_DEFINITION.projects.reduce((s, p) => s + p.grp, 0)).toBe(3580);
    expect(GAME_DEFINITION.diseases.filter((d) => d.startIdentified).map((d) => d.id).sort()).toEqual(['D01', 'D02', 'D03', 'D09', 'D12']);
    const route = GAME_DEFINITION.diseases.filter((d) => d.chapter < 5 || d.category === 'absurd');
    expect(route.length).toBe(18);
    expect(route.reduce((s, d) => s + d.masteryThreshold, 0)).toBe(3300);
    expect(DEF.project.F06.requires).toEqual(['F01']);
    expect(DEF.project.F09.requires).toEqual(['F08']);
    expect(DEF.project.F12.requires).toEqual(['F11']);
  });
  it('REQ-DATA-06 staff wages and training catalogue', () => {
    expect(GAME_DEFINITION.roles.map((r) => r.wage)).toEqual([450, 650, 1200, 750, 900, 1650, 2000, 400, 1100]);
    expect(GAME_DEFINITION.trainings.map((t) => [t.cost, t.days, t.gain])).toEqual([
      [2000, 1, 15], [2500, 1, 15], [2000, 1, 15], [3500, 2, 20], [3000, 1, 15], [3500, 2, 20], [5000, 2, 25], [6000, 3, 25], [5500, 2, 20], [4000, 2, 20], [3000, 1, 15], [1500, 1, 15],
    ]);
  });
  it('REQ-DATA-07 all player-facing names are Swedish strings', () => {
    for (const r of GAME_DEFINITION.rooms) expect(r.nameSv.length).toBeGreaterThan(2);
    for (const e of GAME_DEFINITION.events) for (const o of e.options) expect(o.labelSv.length).toBeGreaterThan(2);
    expect(DEF.event.E01.nameSv).toBe('Kaffemaskinen strejkar');
    expect(DEF.mission.M01.nameSv).toBe('Minska väntetiden');
  });
});
