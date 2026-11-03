import { DEF } from '../data/definition';
import type { DomainEvent, EventInstance } from '../core/state';
import type { GameApp, UIHooks } from '../app';
import { chapterStatus } from '../systems/campaign';
import { TUTORIAL_STEPS } from '../systems/tutorial';
import { roomStatus, staffOfRoom } from '../systems/rules';
import { activeBookingsForRoom } from '../systems/resources';
import { demolitionRefund, upgradeCost } from '../systems/building';
import { staffDailyWage } from '../systems/staff';
import { clockText, h, icon, kr, num, replace } from './dom';
import { meter } from './charts';
import { CRISIS_SV, OVERLAY_SV, PATIENT_STATE_SV, PRIORITY_SV, STAFF_STATE_SV, TRAIT_SV } from './labels';
import { Panels, type PanelName } from './panels';

type SheetSize = 'compact' | 'medium' | 'large';

export class UI implements UIHooks {
  root: HTMLElement;
  stage: HTMLElement;
  private hud!: HTMLElement;
  private timebar!: HTMLElement;
  private nav!: HTMLElement;
  private sheet!: HTMLElement;
  private sheetBody!: HTMLElement;
  private sheetTitle!: HTMLElement;
  private toasts!: HTMLElement;
  private modalRoot!: HTMLElement;
  private tutorialCard!: HTMLElement;
  private buildHud!: HTMLElement;
  private pauseBadge!: HTMLElement;
  panel: PanelName | 'info' | null = null;
  private lastRefresh = 0;
  private sheetPointerDown = false;
  private eventQueue: EventInstance[] = [];
  private modalOpen = false;
  readonly panels: Panels;

  constructor(public app: GameApp, mount: HTMLElement) {
    this.panels = new Panels(app, this);
    this.root = h('div', { class: 'game-root' });
    this.stage = h('div', { class: 'stage', id: 'stage' });
    this.build();
    mount.replaceChildren(this.root);
    app.ui = this;
    this.refresh(true);
  }

  private build(): void {
    this.hud = h('header', { class: 'hud', 'aria-live': 'polite' });
    this.timebar = h('div', { class: 'timebar' });
    this.nav = h('nav', { class: 'bottomnav' });
    this.sheetTitle = h('h2', null);
    this.sheetBody = h('div', { class: 'sheet-body' });
    this.sheet = h('section', { class: 'sheet hidden', role: 'dialog' },
      h('div', { class: 'sheet-head' }, h('div', { class: 'grip' }), this.sheetTitle, h('button', { class: 'icon-btn close', 'aria-label': 'Stäng', onclick: () => this.closeSheet() }, icon('ic_close', true))),
      this.sheetBody);
    this.sheet.addEventListener('pointerdown', () => (this.sheetPointerDown = true));
    this.sheet.addEventListener('pointerup', () => setTimeout(() => (this.sheetPointerDown = false), 50));
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.modalRoot = h('div', { class: 'modal-root' });
    this.tutorialCard = h('div', { class: 'tutorial hidden' });
    this.buildHud = h('div', { class: 'buildhud hidden' });
    this.pauseBadge = h('button', { class: 'pause-badge hidden', onclick: () => this.app.setPaused(false) }, icon('ic_play', true), ' Pausat – tryck för att fortsätta');
    this.stage.append(this.tutorialCard, this.toasts, this.pauseBadge, this.buildHud, this.sheet);
    const navItems: [PanelName, string, string][] = [['build', 'Bygg', 'nav_build'], ['staff', 'Personal', 'nav_staff'], ['analytics', 'Analys', 'nav_analytics'], ['missions', 'Uppdrag', 'nav_missions']];
    for (const [name, label, ic] of navItems) {
      this.nav.append(h('button', { class: 'navbtn', 'data-panel': name, onclick: () => this.togglePanel(name) }, icon(ic), h('span', null, label), h('i', { class: 'navbadge hidden' })));
    }
    this.root.append(this.hud, this.stage, this.timebar, this.nav, this.modalRoot);
    this.renderTimebar();
  }

  // ------------------------------------------------------------------ HUD + time bar
  private renderHud(): void {
    const w = this.app.engine.world;
    const s = w.state;
    const today = s.metrics.today;
    const st = chapterStatus(w);
    const met = st.filter((x) => x.met).length;
    const crisis = s.economy.crisis;
    replace(this.hud,
      h('div', { class: 'hud-row' },
        h('div', { class: `hud-cash ${s.economy.cash < 0 ? 'neg' : ''}` }, icon('ic_money', true), h('b', { 'data-testid': 'cash' }, kr(s.economy.cash))),
        h('div', { class: 'hud-rep', title: 'Rykte' }, icon('ic_rep', true), h('b', { 'data-testid': 'reputation' }, num(s.metrics.reputation, 0))),
        h('div', { class: 'hud-time' }, icon('ic_clock', true), h('b', { 'data-testid': 'clock' }, `Dag ${w.day + 1} ${clockText(w.minuteOfDay)}`)),
      ),
      h('div', { class: 'hud-row small' },
        h('span', { class: 'hud-chapter', onclick: () => this.openPanel('missions') }, `Kap ${s.progress.chapter}: ${DEF.chapter[String(s.progress.chapter) as '1'].titleSv}`, s.progress.chapter < 5 ? ` · ${met}/${st.length} mål` : s.progress.inspection?.active ? ` · Inspektion dag ${s.progress.inspection.days.length + 1}/7` : ''),
        h('span', { class: `hud-flow ${today.revenue - today.costs >= 0 ? 'pos' : 'neg'}` }, `Idag ${kr(today.revenue - today.costs)}`),
        crisis !== 'none' ? h('span', { class: `crisis ${crisis}`, onclick: () => this.openPanel('analytics', 'eco') }, icon('ic_warning', true), CRISIS_SV[crisis]) : null,
      ),
    );
    this.pauseBadge.classList.toggle('hidden', !s.clock.paused || this.modalOpen || this.panel !== null);
  }

  renderTimebar(): void {
    const s = this.app.engine.state;
    const speedBtn = (speed: number, ic: string, label: string) =>
      h('button', { class: `tbtn ${(!s.clock.paused && s.clock.speed === speed) || (speed === 0 && s.clock.paused) ? 'on' : ''}`, 'aria-label': label, 'data-testid': `speed-${speed}`, onclick: () => (speed === 0 ? this.app.setPaused(true) : this.app.dispatch({ type: 'SET_SPEED', speed }, true)) }, icon(ic, true));
    replace(this.timebar,
      speedBtn(0, 'ic_pause', 'Paus'), speedBtn(1, 'ic_play', 'Normal hastighet'), speedBtn(2, 'ic_fast', 'Snabb'), speedBtn(4, 'ic_faster', 'Mycket snabb'),
      h('button', { class: `tbtn wide ${this.app.overlay !== 'none' ? 'on' : ''}`, 'data-testid': 'overlay', onclick: () => this.cycleOverlay() }, icon('ic_overlay', true), h('span', null, OVERLAY_SV[this.app.overlay])),
      h('button', { class: 'tbtn', 'aria-label': 'Inställningar', 'data-testid': 'settings', onclick: () => this.togglePanel('settings') }, icon('ic_settings', true)),
    );
  }

  private cycleOverlay(): void {
    const order = ['none', 'status', 'utilization', 'queue', 'traffic'] as const;
    this.app.overlay = order[(order.indexOf(this.app.overlay) + 1) % order.length]!;
    this.renderTimebar();
    this.toast(`Kartläge: ${OVERLAY_SV[this.app.overlay]}`);
  }

  // ------------------------------------------------------------------ refresh loop
  refresh(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastRefresh < 250) return;
    const slow = now - this.lastRefresh > 1000 || force;
    this.lastRefresh = now;
    this.renderHud();
    this.renderTimebar();
    this.renderTutorial();
    this.renderBadges();
    if (this.panel && (force || slow) && !this.sheetPointerDown) this.renderPanel();
    if (this.app.buildMode) this.renderBuildHud();
    this.showNextEvent();
  }

  private renderBadges(): void {
    const s = this.app.engine.state;
    const pending = s.events.active.filter((e) => !e.ended && e.choice === null).length;
    const missions = s.missions.active.length;
    const b = this.nav.querySelector('[data-panel="missions"] .navbadge') as HTMLElement;
    b.textContent = String(pending || missions || '');
    b.classList.toggle('hidden', pending + missions === 0);
    b.classList.toggle('alert', pending > 0);
  }

  // ------------------------------------------------------------------ sheets
  togglePanel(name: PanelName): void {
    if (this.panel === name) this.closeSheet();
    else this.openPanel(name);
  }

  openPanel(name: PanelName, tab?: string): void {
    if (this.app.buildMode && name !== 'build') this.app.stopBuild();
    if (tab) this.panels.tab[name] = tab;
    this.panel = name;
    const size: SheetSize = name === 'build' || name === 'staff' ? 'medium' : 'large';
    this.sheet.className = `sheet ${size}`;
    this.sheetTitle.textContent = { build: 'Bygg', staff: 'Personal', analytics: 'Analys', missions: 'Uppdrag & forskning', settings: 'Inställningar' }[name];
    this.app.panelOpened(size === 'large');
    for (const b of this.nav.querySelectorAll('.navbtn')) b.classList.toggle('on', (b as HTMLElement).dataset.panel === name);
    this.renderPanel();
  }

  renderPanel(): void {
    if (!this.panel) return;
    const scroll = this.sheetBody.scrollTop;
    if (this.panel === 'info') this.renderInfo();
    else replace(this.sheetBody, this.panels.render(this.panel));
    this.sheetBody.scrollTop = scroll;
  }

  closeSheet(): void {
    this.panel = null;
    this.sheet.className = 'sheet hidden';
    for (const b of this.nav.querySelectorAll('.navbtn')) b.classList.remove('on');
    this.app.panelClosed();
    if (this.app.buildMode && !this.app.draft) this.app.stopBuild();
    this.refresh(true);
  }

  // ------------------------------------------------------------------ selection info (compact sheet)
  openSelection(): void {
    if (!this.app.selection) {
      if (this.panel === 'info') this.closeSheet();
      return;
    }
    this.panel = 'info';
    this.sheet.className = 'sheet compact';
    for (const b of this.nav.querySelectorAll('.navbtn')) b.classList.remove('on');
    this.renderPanel();
  }

  showDetail(): void {
    this.openSelection();
    this.sheet.className = 'sheet medium';
  }

  private renderInfo(): void {
    const sel = this.app.selection;
    const w = this.app.engine.world;
    if (!sel) return;
    if (sel.kind === 'patient') {
      const p = w.patientById.get(sel.id);
      if (!p) return this.closeSheet();
      const c = w.caseById.get(p.caseId)!;
      const d = DEF.disease[c.disease];
      const known = !c.observation;
      this.sheetTitle.textContent = p.name;
      const next = c.stepIndex < c.path.length ? DEF.step[c.path[c.stepIndex]!].nameSv : 'Klar';
      replace(this.sheetBody,
        h('div', { class: 'info-grid' },
          h('div', null, h('small', null, 'Diagnos'), h('b', null, known ? d.nameSv : 'Okänd sjukdom – observeras'), known ? h('p', { class: 'muted' }, d.descriptionSv) : null),
          h('div', null, h('small', null, 'Status'), h('b', null, PATIENT_STATE_SV[p.state]), h('p', { class: 'muted' }, `Nästa steg: ${next} · Triage ${p.triage}${p.escalated ? ' (försämrad)' : ''}`)),
          h('div', null, h('small', null, `Hälsa ${Math.round(p.health)}`), meter(p.health)),
          h('div', null, h('small', null, `Tålamod ${Math.round(Math.max(0, p.patience))}`), meter(p.patience)),
          h('div', null, h('small', null, 'Väntat'), h('b', null, `${Math.round(p.waitMinutes)} min`), p.overnightMinutes > 0 ? h('p', { class: 'muted' }, `Över natten: ${Math.round(p.overnightMinutes)} min`) : null),
          h('div', null, h('small', null, 'Vårdväg'), h('p', null, c.path.map((s, i) => `${i < c.stepIndex ? '✓ ' : ''}${DEF.step[s].nameSv}`).join(' → '))),
        ));
      return;
    }
    if (sel.kind === 'staff') {
      const s = w.staffById.get(sel.id);
      if (!s) return this.closeSheet();
      this.sheetTitle.textContent = s.name;
      replace(this.sheetBody, this.panels.staffDetail(s));
      return;
    }
    const r = w.roomById.get(sel.id);
    if (!r) return this.closeSheet();
    const def = DEF.room[r.type];
    const st = roomStatus(w, r);
    this.sheetTitle.textContent = def.nameSv;
    const staff = staffOfRoom(w, r.id);
    const up = upgradeCost(r);
    const step = def.steps[0];
    const queue = step ? w.state.queues.filter((q) => q.step === step).length : 0;
    const busy = activeBookingsForRoom(w, r.id).length;
    replace(this.sheetBody,
      h('div', { class: 'info-grid' },
        h('div', null, h('small', null, 'Status'), h('b', { class: st.operational ? 'good' : 'bad' }, st.operational ? '✓ ' : '⚠ ', st.reasonSv), h('p', { class: 'muted' }, def.descriptionSv)),
        h('div', null, h('small', null, 'Kapacitet'), h('b', null, `${busy}/${r.layout.stations.length} platser upptagna`), step ? h('p', { class: 'muted' }, `${queue} i kö till ${DEF.step[step].nameSv.toLowerCase()}`) : null),
        h('div', null, h('small', null, `Städning ${Math.round(r.cleanliness)} %`), meter(r.cleanliness)),
        h('div', null, h('small', null, 'Utrustning'), h('b', null, `Nivå ${r.level}`), h('p', { class: 'muted' }, `Drift ${kr(Math.round((def.baseOperation + 2 * r.w * r.h) * DEF.econ.upgradeLevels[r.level - 1]!.operationMult))}/dag`)),
        def.team.length ? h('div', { class: 'span2' }, h('small', null, `Personal (behövs: ${def.team.map((x) => DEF.role[x].nameSv).join(' + ')})`),
          staff.length ? h('ul', { class: 'mini-list' }, staff.map((x) => h('li', { onclick: () => { this.app.selection = { kind: 'staff', id: x.id }; this.openSelection(); } }, `${x.name} – ${DEF.role[x.role].nameSv} (${x.shift === 'day' ? 'dag' : 'natt'}) · ${STAFF_STATE_SV[x.state]}`))) : h('p', { class: 'bad' }, 'Ingen personal placerad'),
          h('button', { class: 'btn', onclick: () => this.openPanel('staff', 'hire') }, icon('nav_staff', true), ' Anställ')) : null,
      ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', 'data-testid': 'room-toggle', onclick: () => this.app.dispatch({ type: 'SET_ROOM_OPEN', roomId: r.id, open: !r.open }) }, r.open ? 'Stäng rummet' : 'Öppna rummet'),
        up !== null ? h('button', { class: 'btn', 'data-testid': 'room-upgrade', onclick: () => this.app.dispatch({ type: 'UPGRADE_ROOM', roomId: r.id }) }, icon('ic_upgrade', true), ` Uppgradera (${kr(up)})`) : null,
        r.level > 1 ? h('button', { class: 'btn', onclick: () => this.app.dispatch({ type: 'SELL_EQUIPMENT', roomId: r.id }) }, `Sälj utrustning (+${kr(Math.floor((r.upgradeCosts[r.upgradeCosts.length - 1] ?? 0) * 0.5))})`) : null,
        step || def.stationKind === 'cleaning' ? h('select', { class: 'btn', 'aria-label': 'Prioritet', onchange: (e: Event) => this.app.dispatch({ type: 'SET_DEPARTMENT_PRIORITY', roomType: r.type, priority: (e.target as HTMLSelectElement).value as 'low' }) },
          (['low', 'normal', 'high'] as const).map((p) => h('option', { value: p, selected: (w.state.policy.departmentPriority[r.type] ?? 'normal') === p }, `Prioritet: ${PRIORITY_SV[p]}`))) : null,
        r.undoable && !r.used ? h('button', { class: 'btn', onclick: () => this.app.dispatch({ type: 'DEMOLISH_ROOM', roomId: r.id, mode: 'undo' }) }, `Ångra bygget (+${kr(demolitionRefund(r))})`) : null,
        h('button', { class: 'btn danger', 'data-testid': 'room-demolish', onclick: () => this.confirm(`Riv ${def.nameSv.toLowerCase()}?`, `Du får tillbaka ${kr(demolitionRefund(r))}. Pågående vård avslutas först; nya patienter tas inte emot.`, 'Riv när tomt', () => this.app.dispatch({ type: 'DEMOLISH_ROOM', roomId: r.id, mode: 'whenEmpty' }), 'Evakuera nu', () => this.app.dispatch({ type: 'DEMOLISH_ROOM', roomId: r.id, mode: 'evacuate' })) }, icon('ic_trash', true), ' Riv'),
      ),
      r.closing ? h('p', { class: 'warn' }, 'Rummet rivs när den sista patienten har lämnat.') : null,
    );
  }

  // ------------------------------------------------------------------ build HUD
  onDraftChanged(): void {
    this.renderBuildHud();
    if (this.panel === 'build') this.renderPanel();
  }

  private renderBuildHud(): void {
    const m = this.app.buildMode;
    this.buildHud.classList.toggle('hidden', !m);
    if (!m) return;
    if (this.panel === 'build') {
      this.sheet.className = 'sheet hidden';
      this.panel = null;
    }
    const d = this.app.draft;
    const p = this.app.draftPreview;
    const title = m.kind === 'room' ? DEF.room[m.roomType!].nameSv : m.kind === 'corridor' ? 'Korridor' : 'Riv korridor';
    const def = m.roomType ? DEF.room[m.roomType] : null;
    replace(this.buildHud,
      h('div', { class: 'bh-head' }, h('b', null, m.blueprint ? `Ritning: ${title}` : title), def ? h('span', { class: 'muted' }, ` minst ${def.minW}×${def.minH}`) : null),
      !d ? h('p', { class: 'muted' }, m.kind === 'room' ? 'Tryck där rummet ska ligga eller dra en rektangel med ett finger. Två fingrar flyttar och zoomar kartan.' : 'Dra över rutorna. Två fingrar flyttar kartan.') :
        h('div', { class: 'bh-body' },
          h('div', { class: 'bh-stats' },
            h('span', null, `${d.w}×${d.h}`),
            h('span', { 'data-testid': 'build-cost' }, p ? (p.cost >= 0 ? kr(p.cost) : `+${kr(-p.cost)}`) : ''),
            m.kind === 'room' && p ? h('span', null, `${p.stations} platser`) : null,
            m.kind === 'room' && p ? h('span', null, `Drift ~${kr(p.dailyOperation)}/dag`) : null,
            m.kind === 'room' && p && p.staffNeeded.length ? h('span', null, `Personal: ${p.staffNeeded.join(' + ')}`) : null,
          ),
          p && !p.ok ? h('ul', { class: 'errors', 'data-testid': 'build-errors' }, p.errorsSv.map((e) => h('li', null, '⚠ ', e))) : h('p', { class: 'good' }, '✓ Giltig placering', m.kind === 'room' ? ' · tryck på väggen för att flytta dörren' : ''),
        ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', 'data-testid': 'build-confirm', disabled: !d || !p?.ok, onclick: () => this.app.confirmDraft() }, icon('ic_check', true), m.blueprint ? ' Lägg till ritning' : m.kind === 'demolishCorridor' ? ' Riv' : ' Bygg'),
        h('button', { class: 'btn', 'data-testid': 'build-cancel', onclick: () => this.app.stopBuild() }, icon('ic_close', true), ' Avbryt'),
      ),
    );
  }

  // ------------------------------------------------------------------ tutorial
  private renderTutorial(): void {
    const t = this.app.engine.state.tutorial;
    const show = !t.done && !this.app.buildMode && this.panel === null;
    this.tutorialCard.classList.toggle('hidden', !show);
    if (!show) return;
    const step = TUTORIAL_STEPS[t.step];
    if (!step) return;
    const key = `${t.step}`;
    if (this.tutorialCard.dataset.step === key) return;
    this.tutorialCard.dataset.step = key;
    replace(this.tutorialCard,
      h('div', { class: 'tut-head' }, h('b', null, `${t.step + 1}/${TUTORIAL_STEPS.length} · ${step.titleSv}`)),
      h('p', null, step.textSv),
      h('div', { class: 'btn-row' },
        step.manual ? h('button', { class: 'btn primary', 'data-testid': 'tutorial-next', onclick: () => { this.app.dispatch({ type: 'TUTORIAL', action: t.step >= TUTORIAL_STEPS.length - 1 ? 'complete' : 'advance' }, true); delete this.tutorialCard.dataset.step; this.refresh(true); } }, t.step >= TUTORIAL_STEPS.length - 1 ? 'Klart!' : 'Nästa') : null,
        step.id === 'build' ? h('button', { class: 'btn', onclick: () => this.openPanel('build') }, 'Öppna Bygg') : null,
        step.id === 'hire' ? h('button', { class: 'btn', onclick: () => this.openPanel('staff', 'hire') }, 'Öppna Personal') : null,
        step.id === 'effect' ? h('button', { class: 'btn', onclick: () => this.openPanel('analytics') }, 'Öppna Analys') : null,
        h('button', { class: 'btn ghost', 'data-testid': 'tutorial-skip', onclick: () => { this.app.dispatch({ type: 'TUTORIAL', action: 'skip' }, true); this.refresh(true); } }, 'Hoppa över'),
      ),
    );
  }

  // ------------------------------------------------------------------ events, toasts, modals
  onEvent(e: DomainEvent): void {
    const p = e.payload;
    const w = this.app.engine.world;
    switch (e.type) {
      case 'CAMPAIGN_CHAPTER_COMPLETED': {
        const ch = DEF.chapter[String(p.chapter) as '1'];
        const next = DEF.chapter[String(p.next) as '1'];
        this.modal(`Kapitel ${p.chapter} klart!`, [h('p', null, `”${ch.titleSv}” är avklarat. Bidrag: ${kr(p.grant as number)}.`), h('p', null, h('b', null, 'Nytt: '), ch.unlockSummarySv), h('h3', null, `Kapitel ${p.next}: ${next.titleSv}`), h('p', null, next.introSv)], [['Fortsätt', () => undefined]], 'milestone');
        break;
      }
      case 'CAMPAIGN_VICTORY':
        this.victory();
        break;
      case 'INSPECTION_FAILED':
        this.modal('Slutinspektionen underkänd', [h('p', null, String(p.reason)), h('p', null, 'Inget av det du byggt försvinner. Förbättra sjukhuset och starta en ny inspektion när du är redo.')], [['OK', () => undefined]]);
        break;
      case 'INSPECTION_STARTED':
        this.toast('Slutinspektionen börjar vid midnatt – sju dagar av granskning!', 'warn');
        break;
      case 'DISEASE_IDENTIFIED':
        this.toast(`Ny sjukdom identifierad: ${DEF.disease[p.disease as 'D01'].nameSv}`, 'good');
        break;
      case 'DISEASE_MASTERED':
        this.toast(`Bemästrad: ${DEF.disease[p.disease as 'D01'].nameSv}`, 'good');
        break;
      case 'RESEARCH_COMPLETED':
        this.toast(`Forskning klar: ${DEF.project[p.project as 'F01'].nameSv}`, 'good');
        break;
      case 'MISSION_COMPLETED':
        this.toast(`Uppdrag klart: ${DEF.mission[p.template as 'M01'].nameSv} (+${kr((p.reward as { cash: number }).cash)})`, 'good');
        break;
      case 'MISSION_STARTED':
        this.toast(`Nytt uppdrag: ${DEF.mission[p.template as 'M01'].nameSv}`);
        break;
      case 'ECONOMY_WARNING':
        this.toast('Kassan räcker bara några dagar till. Se över kostnaderna under Analys → Ekonomi.', 'warn');
        break;
      case 'CRISIS_STARTED':
        this.toast('Ekonomisk kris! Stäng rum, sälj utrustning eller ta ett krislån.', 'bad');
        break;
      case 'CRISIS_ENDED':
        this.toast('Ekonomin har stabiliserats.', 'good');
        break;
      case 'STAFF_TRAINED':
        this.toast(`${w.staffById.get(p.staffId as number)?.name ?? 'En medarbetare'} har gått klart utbildningen.`, 'good');
        break;
      case 'PATIENT_LEFT':
        if (p.outcome === 'CRITICAL') this.toast('En patient blev så dålig att hen fick åka ambulans till ett annat sjukhus.', 'bad');
        break;
      case 'EMERGENCY_ESCALATED':
        break;
      case 'EVENT_STARTED': {
        const inst = w.state.events.active.find((x) => x.id === p.eventId);
        if (inst && inst.choice === null && !this.eventQueue.includes(inst)) this.eventQueue.push(inst);
        else if (inst && p.choice === undefined) this.toast(`${DEF.event[inst.template].nameSv}`, 'warn');
        break;
      }
      case 'EVENT_ENDED':
        if (p.template === 'E05') this.toast(`Kvalitetsinspektionen är klar: ${['underkänd', 'godkänd', 'utmärkt'][(p.params as { verdict?: number }).verdict ?? 1]}.`, 'info');
        break;
      case 'RECONSTRUCTION':
        this.toast('Rekonstruktion genomförd. Skulderna är samlade i ett dyrt lån.', 'warn');
        break;
    }
  }

  private showNextEvent(): void {
    if (this.modalOpen) return;
    const inst = this.eventQueue.shift();
    if (!inst || inst.choice !== null || inst.ended) return;
    const t = DEF.event[inst.template];
    const wasPaused = this.app.engine.state.clock.paused;
    if (!wasPaused) this.app.setPaused(true);
    this.modal(t.nameSv, [h('p', null, t.textSv), ...t.options.map((o) => h('p', { class: 'muted' }, h('b', null, `${o.labelSv}: `), o.consequenceSv))],
      t.options.map((o) => [o.labelSv, () => { this.app.dispatch({ type: 'CHOOSE_EVENT_OPTION', eventId: inst.id, optionId: o.id }); if (!wasPaused) this.app.setPaused(false); }] as [string, () => void]), 'event');
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info'): void {
    const glyph = { info: 'ic_info', good: 'ic_check', bad: 'ic_warning', warn: 'ic_warning' }[kind];
    const el = h('div', { class: `toast ${kind}`, role: 'status' }, icon(glyph, true), h('span', null, text));
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  modal(title: string, body: Node[], actions: [string, () => void][], kind = ''): void {
    this.modalOpen = true;
    const close = () => {
      overlay.remove();
      this.modalOpen = this.modalRoot.children.length > 0;
      this.refresh(true);
    };
    const overlay = h('div', { class: `modal-overlay ${kind}` },
      h('div', { class: 'modal', role: 'alertdialog', 'aria-label': title },
        kind === 'milestone' || kind === 'victory' ? h('div', { class: 'modal-art' }, icon(kind === 'victory' ? 'ic_stetho' : 'ic_rep')) : kind === 'event' ? h('div', { class: 'modal-art' }, icon('ic_event')) : null,
        h('h2', null, title), ...body,
        h('div', { class: 'btn-row' }, actions.map(([label, fn], i) => h('button', { class: `btn ${i === 0 ? 'primary' : ''}`, onclick: () => { close(); fn(); } }, label))),
      ));
    this.modalRoot.append(overlay);
  }

  confirm(title: string, text: string, okLabel: string, ok: () => void, altLabel?: string, alt?: () => void): void {
    const actions: [string, () => void][] = [[okLabel, ok]];
    if (altLabel && alt) actions.push([altLabel, alt]);
    actions.push(['Avbryt', () => undefined]);
    this.modal(title, [h('p', null, text)], actions);
  }

  victory(): void {
    const s = this.app.engine.state;
    const t = s.metrics.totals;
    const rate = t.completed ? (t.success / Math.max(1, t.completed + t.critical)) * 100 : 0;
    this.modal('Det gyllene stetoskopet!', [
      h('p', null, 'Slutinspektionen är godkänd. Ditt sjukhus är regionens stolthet – och personalen har fått en ny kaffemaskin.'),
      h('div', { class: 'victory-stats' },
        ...([['Dag', String(this.app.engine.world.day)], ['Vårdade patienter', num(t.completed)], ['Lyckade behandlingar', `${num(rate, 1)} %`], ['Bemästrade sjukdomar', `${s.research.mastered.length}/24`], ['Forskningsprojekt', `${s.research.projectsDone.length}/12`], ['Total intäkt', kr(t.revenue)], ['Rykte', num(s.metrics.reputation, 1)], ['Personal', String(s.staff.length)]] as [string, string][]).map(([k, v]) => h('div', null, h('small', null, k), h('b', null, v)))),
    ], [['Fortsätt spela', () => this.app.dispatch({ type: 'CONTINUE_AFTER_VICTORY' })], ['Ny kampanj', () => this.panels.newCampaign()]], 'victory');
  }
}

export { staffDailyWage, TRAIT_SV };
