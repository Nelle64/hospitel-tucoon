import { DEF, GAME_DEFINITION } from '../data/definition';
import { FINAL_INSPECTION } from '../data/progression';
import type { DiseaseId, RoleId, RoomTypeId, TrainingId } from '../data/types';
import type { StaffState } from '../core/state';
import type { GameApp } from '../app';
import { chapterStatus, inspectionPrerequisites } from '../systems/campaign';
import { activeLoans, dailyFixedCosts, loanRemaining, projectedCash, totalOverdue } from '../systems/economy';
import { aggregate, lastDays, roomUtilization } from '../systems/metrics';
import { missionText } from '../systems/missions';
import { projectAvailable } from '../systems/research';
import { landExpansionCost, roomBuildCost } from '../systems/building';
import { blueprintTotals } from '../systems/blueprint';
import { assignmentError, staffDailyWage, trainingCost } from '../systems/staff';
import { diseaseStatus } from '../systems/demand';
import { pressureScore } from '../systems/pressure';
import { chart, meter } from './charts';
import { h, icon, kr, num } from './dom';
import { CRISIS_SV, QUEUE_POLICY_SV, STAFF_STATE_SV, TRAIT_SV } from './labels';
import type { UI } from './ui';

export type PanelName = 'build' | 'staff' | 'analytics' | 'missions' | 'settings';

export interface Shell {
  newCampaign(): void;
  importSave(): void;
  exportSave(): void;
  diagnostics(): string;
  saveNow(): void;
  appVersion: string;
}

function tabs(current: string, items: [string, string][], set: (t: string) => void): HTMLElement {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map(([id, label]) => h('button', { class: `tab ${current === id ? 'on' : ''}`, role: 'tab', 'data-testid': `tab-${id}`, onclick: () => set(id) }, label)));
}

export class Panels {
  tab: Record<string, string> = { build: 'rooms', staff: 'list', analytics: 'overview', missions: 'campaign', settings: 'game' };
  range = 7;
  shell: Shell | null = null;
  private staffDetailId: number | null = null;

  constructor(private app: GameApp, private ui: UI) {}

  private setTab(panel: string, t: string): void {
    this.tab[panel] = t;
    this.staffDetailId = null;
    this.ui.renderPanel();
  }

  render(p: PanelName): HTMLElement {
    switch (p) {
      case 'build': return this.build();
      case 'staff': return this.staff();
      case 'analytics': return this.analytics();
      case 'missions': return this.missions();
      case 'settings': return this.settings();
    }
  }

  // ================================================================== BUILD
  private build(): HTMLElement {
    const t = this.tab.build!;
    const w = this.app.engine.world;
    const body: (Node | null)[] = [tabs(t, [['rooms', 'Rum'], ['corridor', 'Korridor'], ['blueprint', 'Ritning'], ['land', 'Mark']], (x) => this.setTab('build', x))];
    if (t === 'rooms') {
      body.push(h('div', { class: 'room-grid' }, GAME_DEFINITION.rooms.map((r) => {
        const locked = r.unlockChapter > w.chapter;
        return h('button', { class: `room-card ${locked ? 'locked' : ''}`, 'data-testid': `build-${r.id}`, disabled: locked, onclick: () => this.app.startBuild('room', r.id, false) },
          icon(`room_${r.id}`), h('b', null, r.nameSv), h('small', null, locked ? `Kapitel ${r.unlockChapter}` : `${r.minW}×${r.minH} · från ${kr(roomBuildCost(r.id, r.minW, r.minH))}`));
      })));
    } else if (t === 'corridor') {
      body.push(h('p', { class: 'muted' }, `Korridorer kostar ${DEF.econ.corridorCostPerTile} kr per ruta. Patienter går bara genom korridorer och dörrar – aldrig genom andra vårdrum. Bredare huvudkorridorer minskar trängsel.`),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', 'data-testid': 'build-corridor', onclick: () => this.app.startBuild('corridor', null, false) }, icon('ic_corridor', true), ' Bygg korridor'),
          h('button', { class: 'btn', onclick: () => this.app.startBuild('demolishCorridor', null, false) }, icon('ic_trash', true), ' Riv korridor')));
    } else if (t === 'blueprint') {
      const items = w.state.blueprint.items;
      const tot = blueprintTotals(w);
      body.push(h('p', { class: 'muted' }, 'Planera fritt utan kostnad. Ritningar påverkar inte patienterna förrän du bygger dem.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', 'data-testid': 'bp-room', onclick: () => this.pickRoomForBlueprint() }, icon('ic_blueprint', true), ' Rita rum'),
          h('button', { class: 'btn', onclick: () => this.app.startBuild('corridor', null, true) }, icon('ic_corridor', true), ' Rita korridor')),
        h('div', { class: 'kpis' }, this.kpi('Ritningar', String(items.length)), this.kpi('Byggkostnad', kr(tot.cost)), this.kpi('Drift/dag', kr(tot.dailyOperation)), this.kpi('Konflikter', String(tot.conflicts))),
        items.length ? h('ul', { class: 'list' }, items.map((b) => {
          const ev = this.app.blueprintEval(b.id);
          return h('li', null, h('div', null, h('b', null, b.kind === 'room' ? DEF.room[b.roomType!].nameSv : 'Korridor'), ` ${b.w}×${b.h} · ${kr(ev?.cost ?? 0)}`, h('br'), ev?.ok ? h('small', { class: 'good' }, '✓ Kan byggas') : h('small', { class: 'bad' }, `⚠ ${(ev?.issuesSv ?? []).join(', ')}${ev?.locked ? ' (låst mark)' : ''}`)),
            h('div', { class: 'row-actions' },
              h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'BUILD_BLUEPRINT_SELECTION', ids: [b.id] }) }, 'Bygg'),
              h('button', { class: 'btn small ghost', 'aria-label': 'Ta bort ritning', onclick: () => this.app.dispatch({ type: 'DELETE_BLUEPRINT', id: b.id }) }, icon('ic_trash', true))));
        })) : h('p', { class: 'muted' }, 'Inga ritningar än.'),
        items.length ? h('button', { class: 'btn primary', 'data-testid': 'bp-build-all', onclick: () => this.app.dispatch({ type: 'BUILD_BLUEPRINT_SELECTION', ids: items.map((i) => i.id) }) }, `Bygg alla (${kr(tot.cost)})`) : null);
    } else {
      const stage = w.state.progress.landStage;
      const next = DEF.econ.landStages[stage + 1];
      body.push(h('p', null, `Nuvarande tomt: ${DEF.econ.landStages[stage]!.size}×${DEF.econ.landStages[stage]!.size} rutor.`),
        next ? h('div', null, h('p', null, `Nästa utbyggnad: ${next.size}×${next.size} för ${kr(landExpansionCost(stage)!)}.`), next.chapter > w.chapter ? h('p', { class: 'muted' }, `Blir tillgänglig i kapitel ${next.chapter}.`) : h('button', { class: 'btn primary', 'data-testid': 'expand-land', onclick: () => this.app.dispatch({ type: 'EXPAND_LAND' }) }, icon('ic_land', true), ' Köp mark')) : h('p', { class: 'good' }, 'Hela tomten är köpt.'));
    }
    return h('div', null, body.filter((x): x is Node => x !== null));
  }

  private pickRoomForBlueprint(): void {
    const w = this.app.engine.world;
    this.ui.modal('Välj rum att rita', [h('div', { class: 'room-grid' }, GAME_DEFINITION.rooms.map((r) => h('button', { class: 'room-card', onclick: () => { (document.querySelector('.modal-overlay') as HTMLElement | null)?.remove(); this.app.startBuild('room', r.id, true); this.ui.refresh(true); } }, icon(`room_${r.id}`), h('b', null, r.nameSv), h('small', null, r.unlockChapter > w.chapter ? `Kapitel ${r.unlockChapter}` : `${r.minW}×${r.minH}`))))], [['Avbryt', () => undefined]]);
  }

  // ================================================================== STAFF
  private staff(): HTMLElement {
    const t = this.tab.staff!;
    const w = this.app.engine.world;
    const s = w.state;
    if (this.staffDetailId !== null) {
      const st = w.staffById.get(this.staffDetailId);
      if (st) return h('div', null, h('button', { class: 'btn ghost small', onclick: () => { this.staffDetailId = null; this.ui.renderPanel(); } }, '← Tillbaka'), h('h3', null, st.name), this.staffDetail(st));
      this.staffDetailId = null;
    }
    const body: Node[] = [tabs(t, [['list', `Anställda (${s.staff.length})`], ['hire', 'Rekrytera'], ['training', 'Utbildning']], (x) => this.setTab('staff', x))];
    if (t === 'list') {
      const wages = s.staff.reduce((a, x) => a + staffDailyWage(x), 0);
      body.push(h('p', { class: 'muted' }, `Lönekostnad ${kr(wages)} per dygn (nattpass +15 %).`));
      const byRole = [...s.staff].sort((a, b) => a.role.localeCompare(b.role) || a.id - b.id);
      body.push(h('ul', { class: 'list staff-list' }, byRole.map((x) => {
        const room = x.roomId ? w.roomById.get(x.roomId) : undefined;
        return h('li', { 'data-testid': `staff-${x.id}`, onclick: () => { this.staffDetailId = x.id; this.ui.renderPanel(); } },
          icon(`role_${x.role}`, true),
          h('div', { class: 'grow' }, h('b', null, x.name), h('small', null, ` ${DEF.role[x.role].nameSv}`), h('br'), h('small', { class: x.roomId ? 'muted' : 'warn' }, `${room ? DEF.room[room.type].nameSv : 'Ej placerad'} · ${x.shift === 'day' ? 'Dag' : 'Natt'} · ${STAFF_STATE_SV[x.state]}`)),
          h('div', { class: 'mini-meters' }, h('small', null, 'Energi'), meter(x.energy), h('small', null, 'Stress'), meter(x.stress, 100, 'auto', true)));
      })));
    } else if (t === 'hire') {
      const roomsNeeding = s.rooms.filter((r) => DEF.room[r.type].team.length && !s.staff.some((x) => x.roomId === r.id));
      if (roomsNeeding.length) body.push(h('p', { class: 'warn' }, '⚠ Rum utan personal: ', roomsNeeding.map((r) => DEF.room[r.type].nameSv).join(', ')));
      for (const role of GAME_DEFINITION.roles) {
        if (role.unlockChapter > w.chapter) continue;
        const cands = s.candidates.filter((c) => c.role === role.id);
        body.push(h('h3', null, icon(`role_${role.id}`, true), ` ${role.pluralSv} – grundlön ${kr(role.wage)}/pass`));
        body.push(h('ul', { class: 'list' }, cands.length ? cands.map((c) => {
          const skills = Object.entries(c.skills).filter(([k]) => k in role.skillRanges).map(([k, v]) => `${DEF.skill[k as 'SK01'].nameSv} ${v}`).join(' · ');
          const wage = Math.round(role.wage * (1 + c.wageMod));
          return h('li', null, h('div', { class: 'grow' }, h('b', null, c.name), ` ${kr(wage)}/pass`, h('br'), h('small', { class: 'muted' }, skills), c.traits.length ? h('small', { class: 'muted' }, ` · ${c.traits.map((tr) => TRAIT_SV[tr] ?? tr).join(', ')}`) : null),
            h('button', { class: 'btn small primary', 'data-testid': `hire-${c.id}`, onclick: () => this.hireDialog(c.id, role.id) }, 'Anställ'));
        }) : [h('li', { class: 'muted' }, 'Inga sökande just nu – nya kommer i morgon.')]));
      }
      body.push(h('button', { class: 'btn', onclick: () => this.app.dispatch({ type: 'REFRESH_CANDIDATES' }) }, 'Annonsera efter fler (300 kr)'));
    } else {
      body.push(h('p', { class: 'muted' }, 'En utbildning höjer en färdighet men ändrar aldrig yrket. Under utbildningen arbetar personen inte.'));
      body.push(h('ul', { class: 'list' }, GAME_DEFINITION.trainings.map((tr) => h('li', null, h('div', { class: 'grow' }, h('b', null, tr.nameSv), ` ${kr(trainingCost(w, tr.id))} · ${tr.days} dag${tr.days > 1 ? 'ar' : ''}`, h('br'), h('small', { class: 'muted' }, `+${tr.gain} ${DEF.skill[tr.skill].nameSv.toLowerCase()} · ${tr.roles.map((r) => DEF.role[r].nameSv).join(', ')}`))))));
      const training = s.staff.filter((x) => x.training);
      if (training.length) body.push(h('h3', null, 'På utbildning nu'), h('ul', { class: 'list' }, training.map((x) => h('li', null, `${x.name}: ${DEF.training[x.training!.id].nameSv}, klar dag ${Math.floor(x.training!.until / DEF.sim.ticksPerDay) + 1}`))));
    }
    return h('div', null, body);
  }

  private hireDialog(candidateId: number, role: RoleId): void {
    const w = this.app.engine.world;
    const rooms = w.state.rooms.filter((r) => DEF.room[r.type].team.some((t) => t === role || DEF.role[role].substitutesFor.includes(t)) && !r.closing);
    let shift: 'day' | 'night' = 'day';
    const shiftSel = h('select', { class: 'btn', onchange: (e: Event) => (shift = (e.target as HTMLSelectElement).value as 'day') }, h('option', { value: 'day' }, 'Dagpass 08–20'), h('option', { value: 'night' }, 'Nattpass 20–08 (+15 %)'));
    const list = h('div', { class: 'choice-list' },
      rooms.map((r) => {
        const n = w.state.staff.filter((x) => x.roomId === r.id).length;
        return h('button', { class: 'btn', onclick: () => { close(); this.app.dispatch({ type: 'HIRE_STAFF', candidateId, shift, roomId: r.id }); } }, icon(`room_${r.type}`, true), ` ${DEF.room[r.type].nameSv} (${n} placerade)`);
      }),
      h('button', { class: 'btn ghost', onclick: () => { close(); this.app.dispatch({ type: 'HIRE_STAFF', candidateId, shift, roomId: null }); } }, 'Anställ utan placering'));
    const close = () => document.querySelector('.modal-overlay')?.remove();
    this.ui.modal('Var ska personen arbeta?', [shiftSel, list], [['Avbryt', () => undefined]]);
  }

  staffDetail(s: StaffState): HTMLElement {
    const w = this.app.engine.world;
    const room = s.roomId ? w.roomById.get(s.roomId) : undefined;
    const role = DEF.role[s.role];
    const skills = Object.entries(s.skills).filter(([k, v]) => k in role.skillRanges || v >= 20).sort((a, b) => b[1] - a[1]);
    const trainings = GAME_DEFINITION.trainings.filter((t) => t.roles.includes(s.role));
    const rooms = w.state.rooms.filter((r) => !r.closing && r.id !== s.roomId && DEF.room[r.type].team.some((t) => t === s.role || role.substitutesFor.includes(t)));
    return h('div', null,
      h('div', { class: 'info-grid' },
        h('div', null, h('small', null, 'Yrke'), h('b', null, role.nameSv), h('p', { class: 'muted' }, `${kr(staffDailyWage(s))}/pass · ${s.traits.map((t) => TRAIT_SV[t] ?? t).join(', ') || 'inga särdrag'}`)),
        h('div', null, h('small', null, 'Placering'), h('b', null, room ? DEF.room[room.type].nameSv : 'Ej placerad'), h('p', { class: 'muted' }, `${s.shift === 'day' ? 'Dagpass' : 'Nattpass'} · ${STAFF_STATE_SV[s.state]}${s.training ? ` (${DEF.training[s.training.id].nameSv})` : ''}`)),
        h('div', null, h('small', null, `Energi ${Math.round(s.energy)}`), meter(s.energy)),
        h('div', null, h('small', null, `Stress ${Math.round(s.stress)}`), meter(s.stress, 100, 'auto', true)),
        h('div', { class: 'span2' }, h('small', null, 'Färdigheter'), h('div', { class: 'skills' }, skills.slice(0, 6).map(([k, v]) => h('div', null, h('span', null, `${DEF.skill[k as 'SK01'].nameSv} ${Math.round(v)}`), meter(v, 100, 'neutral'))))),
      ),
      h('h4', null, 'Placera i rum'),
      h('div', { class: 'choice-list' }, rooms.length ? rooms.map((r) => {
        const err = assignmentError(w, s, r.id);
        return h('button', { class: `btn small ${err ? 'ghost' : ''}`, title: err ?? '', onclick: () => this.app.dispatch({ type: 'ASSIGN_STAFF', staffId: s.id, roomId: r.id }) }, `${DEF.room[r.type].nameSv} #${r.id}`, err ? h('small', { class: 'muted' }, ` – ${err}`) : null);
      }) : [h('small', { class: 'muted' }, 'Inga andra lämpliga rum.')]),
      h('div', { class: 'btn-row' },
        s.roomId ? h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'UNASSIGN_STAFF', staffId: s.id }) }, 'Ta bort placering') : null,
        h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'SET_STAFF_SHIFT', staffId: s.id, shift: s.shift === 'day' ? 'night' : 'day' }) }, s.shift === 'day' ? 'Byt till nattpass' : 'Byt till dagpass'),
      ),
      h('h4', null, 'Utbilda'),
      h('div', { class: 'choice-list' }, trainings.map((t) => h('button', { class: 'btn small', 'data-testid': `train-${t.id}`, onclick: () => this.app.dispatch({ type: 'START_TRAINING', staffId: s.id, trainingId: t.id as TrainingId }) }, `${t.nameSv} (${kr(trainingCost(w, t.id))}, ${t.days} d)`))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn small danger', onclick: () => this.ui.confirm(`Avskeda ${s.name}?`, 'Personen slutar direkt. Ingen avgångsersättning betalas.', 'Avskeda', () => this.app.dispatch({ type: 'FIRE_STAFF', staffId: s.id })) }, 'Avskeda')),
    );
  }

  // ================================================================== ANALYTICS
  private kpi(label: string, value: string, sub?: string, tone?: string): HTMLElement {
    return h('div', { class: `kpi ${tone ?? ''}` }, h('small', null, label), h('b', null, value), sub ? h('span', { class: 'muted' }, sub) : null);
  }

  private analytics(): HTMLElement {
    const t = this.tab.analytics!;
    const w = this.app.engine.world;
    const s = w.state;
    const days = lastDays(w, this.range);
    const a = aggregate(days);
    const labels = days.map((d) => `D${d.day + 1}`);
    const body: Node[] = [
      tabs(t, [['overview', 'Översikt'], ['patients', 'Patienter'], ['staff', 'Personal'], ['eco', 'Ekonomi']], (x) => this.setTab('analytics', x)),
      h('div', { class: 'range' }, [7, 30, 90].map((r) => h('button', { class: `chip ${this.range === r ? 'on' : ''}`, 'data-testid': `range-${r}`, onclick: () => { this.range = r; this.ui.renderPanel(); } }, `${r} dagar`))),
    ];
    const today = s.metrics.today;
    if (t === 'overview') {
      body.push(h('div', { class: 'kpis' },
        this.kpi('Kassa', kr(s.economy.cash), CRISIS_SV[s.economy.crisis]),
        this.kpi('Resultat idag', kr(today.revenue - today.costs), `${this.range} d: ${kr(a.result)}`),
        this.kpi('Rykte', num(s.metrics.reputation, 1), 'av 100'),
        this.kpi('Efterfrågan', `${num(s.metrics.demand.expected, 1)}/dag`, `Ankomster idag ${today.arrivals}`),
        this.kpi('Vårdade', String(a.completed), `idag ${today.completed}`),
        this.kpi('Lyckade', a.treated ? `${num(a.successRate, 1)} %` : '–', `${a.success}/${a.treated}`),
        this.kpi('Snittväntan', a.waitCount ? `${num(a.avgWait, 0)} min` : '–', `max ${Math.round(Math.max(0, ...days.map((d) => d.waitMax)))} min`),
        this.kpi('Remiss/gav upp', `${a.referrals}/${a.abandoned}`, 'räknas aldrig som lyckade'),
      ));
      body.push(h('h4', null, 'Rörelseresultat per dag (kr)'), chart({ labels, series: [{ name: 'Resultat', values: days.map((d) => d.result) }], kind: 'bar', format: (v) => kr(v).replace(' kr', '') }));
      body.push(h('h4', null, 'Vårdade patienter per dag'), chart({ labels, series: [{ name: 'Vårdade', values: days.map((d) => d.completed) }], kind: 'line', format: (v) => num(v) }));
      body.push(h('h4', null, 'Kampanjmål'), this.objectives());
    } else if (t === 'patients') {
      const queueNow = s.metrics.queueNow;
      body.push(h('div', { class: 'kpis' }, this.kpi('Ankomster', String(a.arrivals)), this.kpi('Vårdade', String(a.completed)), this.kpi('Remitterade', String(a.referrals)), this.kpi('Gav upp', String(a.abandoned)), this.kpi('Snittväntan', `${num(a.avgWait, 0)} min`), this.kpi('Nöjdhet', a.avgSatisfaction ? num(a.avgSatisfaction, 0) : '–')));
      body.push(h('h4', null, 'Genomsnittlig väntetid (min)'), chart({ labels, series: [{ name: 'Väntetid', values: days.map((d) => (d.waitCount ? d.waitSum / d.waitCount : 0)) }], kind: 'line', format: (v) => num(v) }));
      body.push(h('h4', null, 'Lyckade behandlingar (%)'), chart({ labels, series: [{ name: 'Lyckade', values: days.map((d) => (d.treatedOutcomes ? (d.success / d.treatedOutcomes) * 100 : 0)) }], kind: 'line', format: (v) => `${num(v)} %` }));
      body.push(h('h4', null, 'Köer just nu'), h('ul', { class: 'list' }, Object.entries(queueNow).filter(([, n]) => (n ?? 0) > 0).map(([step, n]) => h('li', null, `${DEF.step[step as 'U'].nameSv}: ${n} väntar`)).concat(Object.values(queueNow).every((n) => !n) ? [h('li', { class: 'muted' }, 'Inga köer just nu.')] : [])));
      body.push(h('h4', null, 'Sjukdomar'), h('ul', { class: 'list' }, GAME_DEFINITION.diseases.filter((d) => d.chapter <= w.chapter).map((d) => h('li', null, h('b', null, s.research.identified.includes(d.id) ? d.nameSv : '??? (okänd)'), h('small', { class: 'muted' }, ` · ${({ treatable: 'kan behandlas', missingRooms: 'saknar avdelning', observation: 'observeras' } as const)[diseaseStatus(w, d)]}`)))));
    } else if (t === 'staff') {
      body.push(h('div', { class: 'kpis' }, this.kpi('Personal', String(s.staff.length)), this.kpi('Arbetsbelastning', `${num(a.staffUtil, 0)} %`, 'tid i arbete under pass'), this.kpi('Energi', num(a.avgEnergy, 0)), this.kpi('Stress', num(a.avgStress, 0)), this.kpi('Utbildningar', String(a.trainings)), this.kpi('Tryck', num(pressureScore(w).total, 0), 'driftstryck 0–100')));
      body.push(h('h4', null, 'Arbetsbelastning per dag (%)'), chart({ labels, series: [{ name: 'Belastning', values: days.map((d) => (d.staffOnShiftMinutes ? (d.staffWorkMinutes / d.staffOnShiftMinutes) * 100 : 0)) }], kind: 'line', format: (v) => `${num(v)} %` }));
      const types = [...new Set(s.rooms.map((r) => r.type))].filter((ty) => DEF.room[ty].steps.length > 0 || ty === 'R02');
      body.push(h('h4', null, 'Rummens beläggning'), h('ul', { class: 'list' }, types.map((ty) => { const u = roomUtilization(days, ty); return h('li', null, h('div', { class: 'grow' }, `${DEF.room[ty].nameSv}: ${num(u, 0)} %`, meter(u, 100, 'neutral'))); })));
      body.push(h('h4', null, 'Energi och stress per person'), h('ul', { class: 'list' }, s.staff.map((x) => h('li', null, h('div', { class: 'grow' }, `${x.name} (${DEF.role[x.role].nameSv})`), h('div', { class: 'mini-meters' }, h('small', null, 'E'), meter(x.energy), h('small', null, 'S'), meter(x.stress, 100, 'auto', true))))));
    } else {
      const fixed = dailyFixedCosts(w);
      body.push(h('div', { class: 'kpis' },
        this.kpi('Kassa', kr(s.economy.cash), CRISIS_SV[s.economy.crisis], s.economy.crisis === 'none' ? '' : 'warnk'),
        this.kpi('Intäkter', kr(a.revenue), `${this.range} dagar`),
        this.kpi('Kostnader', kr(a.costs), `fasta ${kr(days.reduce((x, d) => x + d.fixedCosts, 0))}`),
        this.kpi('Rörelseresultat', kr(a.result)),
        this.kpi('Fasta kostnader/dygn', kr(fixed), 'löner, rum, amorteringar'),
        this.kpi('Prognos 5 dygn', kr(projectedCash(w, 5))),
      ));
      body.push(h('h4', null, 'Intäkter och kostnader per dag (kr)'), chart({ labels, series: [{ name: 'Intäkter', values: days.map((d) => d.revenue) }, { name: 'Kostnader', values: days.map((d) => d.costs) }], kind: 'line', format: (v) => kr(v).replace(' kr', '') }));
      body.push(h('h4', null, 'Kassa vid dagens slut (kr)'), chart({ labels, series: [{ name: 'Kassa', values: days.map((d) => d.cashEnd) }], kind: 'line', format: (v) => kr(v).replace(' kr', ''), zeroBased: false }));
      body.push(this.finance());
      body.push(h('h4', null, 'Senaste transaktioner'), h('ul', { class: 'list tx' }, s.economy.transactions.slice(-25).reverse().map((tx) => h('li', null, h('span', { class: 'grow' }, `D${Math.floor(tx.tick / DEF.sim.ticksPerDay) + 1} ${tx.labelSv}`), h('b', { class: tx.amount >= 0 ? 'good' : 'bad' }, kr(tx.amount))))));
    }
    return h('div', null, body);
  }

  private finance(): HTMLElement {
    const w = this.app.engine.world;
    const s = w.state;
    const loans = activeLoans(w);
    return h('div', null,
      h('h4', null, 'Lån och krisåtgärder'),
      loans.length ? h('ul', { class: 'list' }, loans.map((l) => h('li', null, h('div', { class: 'grow' }, h('b', null, { short: 'Kortfristigt lån', investment: 'Investeringslån', crisis: 'Krislån', reconstruction: 'Rekonstruktionslån' }[l.kind]), ` kvar ${kr(loanRemaining(l))}`, h('br'), h('small', { class: l.overdue ? 'bad' : 'muted' }, l.overdue ? `Förfallet: ${kr(l.overdue)}` : `Nästa amortering ${kr(l.installments[l.nextIndex] ?? 0)}`)),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'REPAY_LOAN', loanId: l.id }) }, 'Lös'), s.economy.crisis !== 'none' ? h('button', { class: 'btn small ghost', onclick: () => this.app.dispatch({ type: 'REQUEST_RESTRUCTURING', loanId: l.id }) }, 'Omförhandla') : null)))) : h('p', { class: 'muted' }, 'Inga lån.'),
      h('div', { class: 'choice-list' }, DEF.econ.loans.map((l) => h('button', { class: 'btn small', 'data-testid': `loan-${l.id}`, onclick: () => this.app.dispatch({ type: 'TAKE_LOAN', kind: l.id }) }, icon('ic_loan', true), ` ${l.nameSv}: ${kr(l.principal)} (avgift ${Math.round(l.feeRate * 100)} %, ${l.termDays} dagar)`))),
      totalOverdue(w) > 0 ? h('p', { class: 'bad' }, 'Förfallna skulder blockerar nya vanliga lån.') : null,
      s.economy.crisis === 'recovery' ? h('div', { class: 'warnbox' }, h('p', null, 'Återhämtningsläge: stäng rum du inte behöver, sälj utrustning i rummens infokort eller omförhandla lån. Som sista utväg finns en dyr rekonstruktion.'), h('button', { class: 'btn danger', onclick: () => this.ui.confirm('Begär rekonstruktion?', 'Alla skulder samlas i ett nytt lån med 20 % avgift, uppgraderingar säljs och ryktet sjunker 15. Kapitel och forskning behålls.', 'Begär rekonstruktion', () => this.app.dispatch({ type: 'REQUEST_RESTRUCTURING', reconstruction: true })) }, 'Rekonstruktion')) : null,
    );
  }

  private objectives(): HTMLElement {
    const w = this.app.engine.world;
    const ch = w.state.progress.chapter;
    const st = ch < 5 ? chapterStatus(w) : inspectionPrerequisites(w);
    return h('ul', { class: 'list objectives' }, st.map((x) => h('li', { class: x.met ? 'met' : '' }, h('span', { class: 'check' }, x.met ? '✓' : '○'), h('div', { class: 'grow' }, x.labelSv, h('br'), h('small', { class: 'muted' }, `${typeof x.current === 'number' ? num(x.current, Number.isInteger(x.current) ? 0 : 1) : x.current} / ${x.target}`)))));
  }

  // ================================================================== MISSIONS & RESEARCH
  private missions(): HTMLElement {
    const t = this.tab.missions!;
    const w = this.app.engine.world;
    const s = w.state;
    const pending = s.events.active.filter((e) => !e.ended && e.choice === null).length;
    const body: Node[] = [tabs(t, [['campaign', 'Kampanj'], ['missions', `Uppdrag (${s.missions.active.length})`], ['events', `Händelser${pending ? ' !' : ''}`], ['research', 'Forskning']], (x) => this.setTab('missions', x))];
    if (t === 'campaign') {
      const ch = DEF.chapter[String(s.progress.chapter) as '1'];
      body.push(h('h3', null, `Kapitel ${ch.id}: ${ch.titleSv}`), h('p', { class: 'muted' }, ch.introSv), this.objectives());
      if (s.progress.chapter === 5) {
        const insp = s.progress.inspection;
        body.push(h('h3', null, icon('ic_inspect', true), ' Slutinspektion'),
          h('p', { class: 'muted' }, `Sju dagar i följd: minst ${FINAL_INSPECTION.minCompletedPerDay} vårdfall per dag, minst ${FINAL_INSPECTION.minSuccessRate} % lyckade, snittväntan under ${FINAL_INSPECTION.maxAvgWait} min, positivt resultat, inga förfallna skulder och rykte minst ${FINAL_INSPECTION.minReputationEnd} vid slutet.`));
        if (s.progress.victory) body.push(h('p', { class: 'good' }, `🏆 Det gyllene stetoskopet vanns dag ${s.progress.victory.day + 1}!`));
        else if (insp?.active) body.push(h('p', null, `Pågår: dag ${insp.days.length}/7 avklarade.`), h('ul', { class: 'list' }, insp.days.map((d, i) => h('li', null, `Dag ${i + 1}: ${d.completed} vårdfall, ${d.treatedOutcomes ? num((d.success / d.treatedOutcomes) * 100, 0) : 0} % lyckade, väntan ${d.waitCount ? num(d.waitSum / d.waitCount, 0) : 0} min, resultat ${kr(d.result)}`))));
        else {
          if (insp?.lastResult === 'failed') body.push(h('p', { class: 'bad' }, `Senaste försöket: ${insp.failReasonSv}`));
          const ready = inspectionPrerequisites(w).every((x) => x.met);
          body.push(h('button', { class: 'btn primary', 'data-testid': 'start-inspection', disabled: !ready, onclick: () => this.app.dispatch({ type: 'START_FINAL_INSPECTION' }) }, ready ? 'Starta slutinspektionen' : 'Uppfyll alla krav först'));
        }
      }
    } else if (t === 'missions') {
      body.push(s.missions.active.length ? h('ul', { class: 'list' }, s.missions.active.map((m) => h('li', null, h('div', { class: 'grow' }, h('b', null, DEF.mission[m.template].nameSv), h('br'), h('span', null, missionText(m)), h('br'), h('small', { class: 'muted' }, `Läge: ${num(m.progress, 1)} · slutar dag ${m.endDay + 1} · belöning ${kr(m.reward.cash)}${m.reward.reputation ? ` +${m.reward.reputation} rykte` : ''}${m.reward.grp ? ` +${m.reward.grp} FP` : ''}`))))) : h('p', { class: 'muted' }, 'Inga aktiva uppdrag. Nya uppdrag kommer när siffrorna visar att något behöver förbättras.'));
      const recent = s.missions.recent.slice(-8).reverse();
      if (recent.length) body.push(h('h4', null, 'Senaste'), h('ul', { class: 'list' }, recent.map((m) => h('li', null, `${m.status === 'success' ? '✓' : '✗'} ${DEF.mission[m.template].nameSv}`))));
    } else if (t === 'events') {
      const act = s.events.active.filter((e) => !e.ended);
      body.push(act.length ? h('ul', { class: 'list' }, act.map((e) => {
        const tp = DEF.event[e.template];
        return h('li', null, h('div', { class: 'grow' }, h('b', null, tp.nameSv), h('br'), h('small', { class: 'muted' }, tp.textSv),
          e.choice === null ? h('div', { class: 'choice-list' }, tp.options.map((o) => h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'CHOOSE_EVENT_OPTION', eventId: e.id, optionId: o.id }) }, o.labelSv))) : h('small', null, ` · Val: ${tp.options.find((o) => o.id === e.choice)?.labelSv ?? ''}`)));
      })) : h('p', { class: 'muted' }, 'Inga pågående händelser.'));
      const recent = s.events.recent.slice(-8).reverse();
      if (recent.length) body.push(h('h4', null, 'Tidigare'), h('ul', { class: 'list' }, recent.map((e) => h('li', null, DEF.event[e.template].nameSv))));
    } else body.push(this.research());
    return h('div', null, body);
  }

  private research(): HTMLElement {
    const w = this.app.engine.world;
    const r = w.state.research;
    if (w.chapter < 2) return h('p', { class: 'muted' }, 'Grundforskning låses upp i kapitel 2. Patienterna ger redan nu kunskap (sjukdomspoäng) om sina sjukdomar.');
    const active = r.active;
    return h('div', null,
      h('div', { class: 'kpis' }, this.kpi('Forskningspoäng (FP)', num(r.grp)), this.kpi('Identifierade', `${r.identified.length}/24`), this.kpi('Bemästrade', `${r.mastered.length}/24`), this.kpi('Projekt klara', `${r.projectsDone.length}/12`)),
      active ? h('div', { class: 'warnbox' }, `Pågår: ${DEF.project[active.id].nameSv}`, meter(w.tick - active.startTick, active.endTick - active.startTick, 'neutral')) : null,
      h('h4', null, 'Teknikprojekt'),
      h('ul', { class: 'list' }, GAME_DEFINITION.projects.map((p) => {
        const done = r.projectsDone.includes(p.id);
        const av = projectAvailable(w, p.id);
        return h('li', { class: done ? 'met' : '' }, h('div', { class: 'grow' }, h('b', null, `${done ? '✓ ' : ''}${p.nameSv}`), ` ${p.grp} FP`, h('br'), h('small', { class: 'muted' }, p.descriptionSv), !done && !av.ok ? h('small', { class: 'muted' }, ` (${av.reasonSv})`) : null),
          !done && av.ok ? h('button', { class: 'btn small primary', 'data-testid': `research-${p.id}`, onclick: () => this.app.dispatch({ type: 'START_RESEARCH', projectId: p.id }) }, 'Starta') : null);
      })),
      h('h4', null, 'Sjukdomsforskning'),
      h('p', { class: 'muted' }, 'Omvandla 1 FP till 2 sjukdomspoäng (max 100 FP per sjukdom och dag). Fokus omvandlar automatiskt hälften av dagens FP.'),
      h('ul', { class: 'list' }, GAME_DEFINITION.diseases.filter((d) => d.chapter <= w.chapter || r.observed.includes(d.id)).map((d) => {
        const rp = r.rp[d.id] ?? 0;
        const ident = r.identified.includes(d.id);
        const mast = r.mastered.includes(d.id);
        return h('li', null, h('div', { class: 'grow' }, h('b', null, ident ? d.nameSv : '??? Okänd sjukdom'), h('small', { class: 'muted' }, mast ? ' · bemästrad' : ident ? ` · ${Math.round(rp)}/${d.masteryThreshold} till bemästrad` : ` · ${Math.round(rp)}/${d.identifyThreshold} till identifierad`), meter(Math.min(rp, mast ? 1 : ident ? d.masteryThreshold : d.identifyThreshold), mast ? 1 : ident ? d.masteryThreshold : Math.max(1, d.identifyThreshold), 'neutral')),
          ident && !mast ? h('div', { class: 'row-actions' },
            h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'CONVERT_GRP_TO_RP', disease: d.id as DiseaseId, grp: Math.max(1, Math.min(r.grp, 100 - (r.convertedToday[d.id] ?? 0), Math.ceil((d.masteryThreshold - rp) / 2))) }) }, 'Forska'),
            h('button', { class: `btn small ${r.focus === d.id ? 'primary' : 'ghost'}`, onclick: () => this.app.dispatch({ type: 'SET_DISEASE_RESEARCH_FOCUS', disease: r.focus === d.id ? null : (d.id as DiseaseId) }) }, 'Fokus')) : null);
      })),
    );
  }

  // ================================================================== SETTINGS
  private settings(): HTMLElement {
    const t = this.tab.settings!;
    const st = this.app.settings;
    const save = () => {
      this.app.sfx.applySettings(st);
      document.documentElement.classList.toggle('high-contrast', st.highContrast);
      document.documentElement.classList.toggle('reduced-motion', st.reducedMotion);
      void this.app.saves?.putSettings(st);
      this.ui.renderPanel();
    };
    const toggle = (label: string, key: 'muted' | 'ambient' | 'reducedMotion' | 'highContrast' | 'pauseInPanels') => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st[key], onchange: (e: Event) => { st[key] = (e.target as HTMLInputElement).checked; save(); } }), h('span', null, label));
    const body: Node[] = [tabs(t, [['game', 'Spel'], ['sound', 'Ljud & grafik'], ['diag', 'Diagnostik']], (x) => this.setTab('settings', x))];
    const s = this.app.engine.state;
    if (t === 'game') {
      body.push(
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', 'data-testid': 'save-now', onclick: () => this.shell?.saveNow() }, icon('ic_save', true), ' Spara nu'),
          h('button', { class: 'btn', 'data-testid': 'export-save', onclick: () => this.shell?.exportSave() }, 'Exportera sparfil'),
          h('button', { class: 'btn', 'data-testid': 'import-save', onclick: () => this.shell?.importSave() }, 'Importera sparfil')),
        h('p', { class: 'muted' }, `Senast sparat: ${this.app.lastSaveAt ?? 'inte än'}${this.app.lastSaveOk ? '' : ' (senaste försöket misslyckades)'}. Spelet sparas automatiskt var 30:e sekund och efter viktiga händelser.`),
        h('h4', null, 'Köprincip'),
        h('div', { class: 'choice-list' }, ([1, 2, 3] as const).map((p) => h('button', { class: `btn small ${s.policy.queue === p ? 'primary' : ''}`, onclick: () => this.app.dispatch({ type: 'SET_QUEUE_POLICY', policy: p }) }, QUEUE_POLICY_SV[p]))),
        h('p', { class: 'muted' }, 'Akuta patienter går alltid först, oavsett köprincip.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => { this.app.dispatch({ type: 'TUTORIAL', action: 'restart' }, true); this.ui.closeSheet(); } }, 'Starta om handledningen'),
          h('button', { class: 'btn danger', onclick: () => this.newCampaign() }, 'Ny kampanj')),
      );
    } else if (t === 'sound') {
      body.push(
        h('label', { class: 'slider' }, h('span', null, `Volym ${Math.round(st.volume * 100)} %`), h('input', { type: 'range', min: 0, max: 100, value: Math.round(st.volume * 100), onchange: (e: Event) => { st.volume = Number((e.target as HTMLInputElement).value) / 100; save(); } })),
        toggle('Ljud av', 'muted'), toggle('Miljöljud (maskiner, monitorer)', 'ambient'),
        h('p', { class: 'muted' }, 'Alla viktiga ljud har en visuell motsvarighet. Spelet går utmärkt att spela utan ljud.'),
        h('h4', null, 'Grafik'),
        h('div', { class: 'choice-list' }, (['high', 'normal', 'low'] as const).map((g) => h('button', { class: `btn small ${st.graphics === g ? 'primary' : ''}`, onclick: () => { st.graphics = g; save(); if (this.app.scene) this.app.scene.game.loop.targetFps = g === 'low' ? 30 : 60; } }, { high: 'Hög', normal: 'Normal', low: 'Låg (30 bilder/s)' }[g]))),
        h('p', { class: 'muted' }, 'Grafikinställningen påverkar aldrig spelreglerna.'),
        h('h4', null, 'Tillgänglighet'),
        toggle('Reducerade animationer', 'reducedMotion'), toggle('Hög kontrast', 'highContrast'), toggle('Pausa när stora paneler är öppna', 'pauseInPanels'),
      );
    } else {
      const text = this.shell?.diagnostics() ?? '';
      body.push(h('pre', { class: 'diag', 'data-testid': 'diagnostics' }, text), h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => { const blob = new Blob([text], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pixel-hospital-diagnostik.txt'; a.click(); } }, 'Exportera diagnostik')));
    }
    return h('div', null, body);
  }

  newCampaign(): void {
    this.ui.confirm('Starta en ny kampanj?', 'Den nuvarande kampanjen ligger kvar sparad och kan fortfarande exporteras.', 'Ny kampanj', () => this.shell?.newCampaign());
  }
}

export type { RoomTypeId };
