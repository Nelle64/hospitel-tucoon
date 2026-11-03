import { DEF, GAME_DEFINITION } from '../data/definition';
import type { EventTemplateId } from '../data/types';
import type { EventInstance } from '../core/state';
import type { World } from '../core/world';
import { canAfford, post } from './economy';
import { addGRP } from './research';
import { pressureScore } from './pressure';
import { spawnPatient, updateReputation } from './patients';
import { activeBookingsForRoom } from './resources';

const TPD = () => DEF.sim.ticksPerDay;

function eligible(w: World, id: EventTemplateId): boolean {
  const t = DEF.event[id];
  if (t.chapter > w.chapter) return false;
  if (w.state.events.active.some((e) => e.template === id && !e.ended)) return false;
  switch (id) {
    case 'E04':
      return w.state.rooms.length >= 5;
    case 'E07':
      return w.state.rooms.some((r) => r.type === 'R08');
    case 'E08':
      return w.state.staff.length >= 4;
    case 'E10':
      return w.state.rooms.some((r) => r.type === 'R13');
    case 'E12':
      return w.state.rooms.some((r) => r.type === 'R18');
    default:
      return true;
  }
}

export function scheduleInitialEvents(w: World): void {
  const e = w.state.events;
  e.nextMinorTick = w.tick + Math.round(TPD() * w.rng.range(0.8, 1.3));
  e.nextMajorTick = Math.max(w.tick + Math.round(TPD() * w.rng.range(3, 5)), DEF.sim.tutorialDays * TPD() + 800);
}

/** Director: picks minor (~daily) and major (every 3–5 days) events, respecting pressure, caps and cooldowns. */
export function eventsTick(w: World): void {
  const ev = w.state.events;
  // End expired events.
  for (const inst of ev.active) {
    if (inst.ended) continue;
    if (inst.choice === null && w.tick >= inst.decideBy) chooseOption(w, inst.id, DEF.event[inst.template].options[DEF.event[inst.template].options.length - 1]!.id, null);
    if (inst.choice !== null && w.tick >= inst.endTick) endEvent(w, inst);
  }
  if (ev.active.length > 0) ev.active = ev.active.filter((e) => !e.ended || e.endTick > w.tick - 10);
  if (w.tick % 100 !== 0) return;
  const P = pressureScore(w).total;
  if (w.tick >= ev.nextMinorTick) {
    ev.nextMinorTick = w.tick + Math.round(TPD() * w.rng.range(0.7, 1.3));
    const minorActive = ev.active.filter((e) => !e.ended && !e.major).length;
    if (minorActive < 3) {
      const pool = GAME_DEFINITION.events.filter((t) => t.severity === 'minor' && eligible(w, t.id) && (P < 85 || t.polarity !== 'negative'));
      const pick = w.rng.weighted(pool, (t) => (P >= 40 && t.polarity === 'negative' ? 0.5 : 1) * (t.polarity === 'positive' && P >= 70 ? 2 : 1));
      if (pick) startEvent(w, pick.id, false);
    }
  }
  if (w.tick >= ev.nextMajorTick) {
    const majorActive = ev.active.some((e) => !e.ended && e.major);
    const tutorial = w.day < DEF.sim.tutorialDays;
    if (majorActive || tutorial) {
      ev.nextMajorTick = w.tick + 600;
      return;
    }
    const pool = GAME_DEFINITION.events.filter((t) => {
      if (t.severity !== 'major' || !eligible(w, t.id)) return false;
      const last = ev.lastMajorTick[t.id];
      if (last !== undefined && w.tick - last < 5 * TPD()) return false;
      if (P >= 70 && t.polarity === 'negative') return false;
      if (P >= 85 && t.polarity !== 'positive' && t.polarity !== 'neutral') return false;
      return true;
    });
    if (pool.length === 0 || (P >= 70 && pool.every((t) => t.polarity === 'negative'))) {
      ev.nextMajorTick = w.tick + 600; // postponed by the pressure director
      return;
    }
    const pick = w.rng.pick(pool);
    ev.nextMajorTick = w.tick + Math.round(TPD() * w.rng.range(3, 5));
    startEvent(w, pick.id, true);
  }
}

export function startEvent(w: World, id: EventTemplateId, major: boolean): EventInstance {
  const t = DEF.event[id];
  const inst: EventInstance = { id: w.nextId('event'), template: id, major, startTick: w.tick, endTick: w.tick + w.minutesToTicks(t.durationHours * 60), choice: null, decideBy: w.tick + w.minutesToTicks(120), params: {}, ended: false };
  w.state.events.active.push(inst);
  if (major) w.state.events.lastMajorTick[id] = w.tick;
  w.emit('EVENT_STARTED', { eventId: inst.id, template: id, major, options: t.options.map((o) => o.id) }, `event:${inst.id}`);
  if (t.options.length === 1) chooseOption(w, inst.id, t.options[0]!.id, null);
  return inst;
}

export function chooseOption(w: World, eventId: number, optionId: string, causation: string | null): { ok: boolean; errorsSv: string[] } {
  const inst = w.state.events.active.find((e) => e.id === eventId && !e.ended);
  if (!inst) return { ok: false, errorsSv: ['Händelsen är inte aktiv'] };
  if (inst.choice !== null) return { ok: false, errorsSv: ['Ett val är redan gjort'] };
  const t = DEF.event[inst.template];
  if (!t.options.some((o) => o.id === optionId)) return { ok: false, errorsSv: ['Okänt val'] };
  const costs: Record<string, number> = { 'E01:repair': 800, 'E02:vip': 500, 'E04:extra': 1200, 'E07:express': 4000, 'E08:temp': 2500, 'E12:negotiate': 3000 };
  const cost = costs[`${inst.template}:${optionId}`] ?? 0;
  if (cost > 0 && !canAfford(w, cost)) return { ok: false, errorsSv: [`Kostar ${cost} kr`] };
  inst.choice = optionId;
  if (cost > 0) post(w, -cost, 'event', `${t.nameSv}: ${t.options.find((o) => o.id === optionId)!.labelSv}`, `event:${inst.id}`);
  const h = (hours: number) => w.tick + w.minutesToTicks(hours * 60);
  switch (inst.template) {
    case 'E01':
      inst.endTick = optionId === 'repair' ? h(8) : h(24);
      break;
    case 'E03':
      if (optionId === 'decline') {
        w.state.metrics.reputation = Math.max(0, w.state.metrics.reputation - 1);
        inst.endTick = w.tick;
      }
      break;
    case 'E05': {
      const tot = w.state.metrics.totals;
      inst.params.sat0 = tot.satisfactionSum;
      inst.params.cnt0 = tot.satisfactionCount;
      break;
    }
    case 'E06': {
      // Extra arrivals for the rest of today on top of the next day's plan modifier.
      const remaining = w.state.metrics.arrivalPlan.filter((a) => a.tick > w.tick && !a.night).length;
      const extra = Math.round(remaining * 0.25);
      for (let i = 0; i < extra; i++) {
        const dayEnd = Math.floor(w.tick / DEF.sim.ticksPerDay) * DEF.sim.ticksPerDay + 2000;
        if (dayEnd <= w.tick) break;
        w.state.metrics.arrivalPlan.push({ tick: w.tick + Math.floor(w.rng.range(1, dayEnd - w.tick)), night: false });
      }
      w.state.metrics.arrivalPlan.sort((a, b) => a.tick - b.tick);
      inst.params.extra = extra;
      break;
    }
    case 'E07': {
      const rooms = w.state.rooms.filter((r) => r.type === 'R08');
      const room = w.rng.pick(rooms);
      const until = optionId === 'express' ? h(3) : h(12);
      room.brokenUntil = until;
      inst.params.roomId = room.id;
      inst.endTick = until;
      w.matchDirty = true;
      break;
    }
    case 'E08': {
      const pool = w.state.staff.filter((s) => !s.training && s.unavailableUntil <= w.tick && !(s.task.kind === 'work') && !(s.roomId && DEF.room[w.roomById.get(s.roomId)?.type ?? 'R01'].stationKind === 'bed' && activeBookingsForRoom(w, s.roomId).length > 0));
      if (pool.length === 0) {
        inst.endTick = w.tick;
        break;
      }
      const s = w.rng.pick(pool);
      const until = optionId === 'temp' ? h(8) : h(24);
      s.unavailableUntil = until;
      inst.params.staffId = s.id;
      inst.endTick = until;
      w.matchDirty = true;
      break;
    }
    case 'E09': {
      const amount = Math.round(w.rng.range(2000, 6000) / 100) * 100;
      post(w, amount, 'event', 'Oväntad donation', `event:${inst.id}`);
      inst.params.amount = amount;
      inst.endTick = w.tick;
      break;
    }
    case 'E10': {
      const n = w.rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const p = spawnPatient(w, false, 'D07');
        if (!p) break;
      }
      inst.params.extra = n;
      break;
    }
    case 'E11':
      addGRP(w, 50, 'event');
      inst.endTick = w.tick;
      break;
    case 'E12':
      inst.endTick = optionId === 'negotiate' ? h(8) : h(24);
      break;
  }
  w.emit('EVENT_STARTED', { eventId: inst.id, template: inst.template, choice: optionId }, `event:${inst.id}`, causation);
  if (inst.endTick <= w.tick) endEvent(w, inst);
  return { ok: true, errorsSv: [] };
}

function endEvent(w: World, inst: EventInstance): void {
  if (inst.ended) return;
  inst.ended = true;
  if (inst.template === 'E05') {
    const tot = w.state.metrics.totals;
    const cnt = tot.satisfactionCount - (inst.params.cnt0 ?? 0);
    const avg = cnt > 0 ? (tot.satisfactionSum - (inst.params.sat0 ?? 0)) / cnt : 50;
    inst.params.avgSatisfaction = Math.round(avg);
    if (avg >= 70) {
      updateReputation(w, 100);
      w.state.metrics.reputation = Math.min(100, w.state.metrics.reputation + 2);
      post(w, 3000, 'event', 'Kvalitetsinspektion: utmärkt service', `event:${inst.id}`);
      inst.params.verdict = 2;
    } else if (avg < 55) {
      w.state.metrics.reputation = Math.max(0, w.state.metrics.reputation - 4);
      inst.params.verdict = 0;
    } else {
      w.state.metrics.reputation = Math.min(100, w.state.metrics.reputation + 1);
      inst.params.verdict = 1;
    }
  }
  if (inst.template === 'E07' && inst.params.roomId) {
    const room = w.roomById.get(inst.params.roomId);
    if (room && room.brokenUntil > w.tick) room.brokenUntil = w.tick;
  }
  const recent = w.state.events.recent;
  recent.push({ template: inst.template, startTick: inst.startTick, choice: inst.choice });
  if (recent.length > 30) recent.splice(0, recent.length - 30);
  w.matchDirty = true;
  w.emit('EVENT_ENDED', { eventId: inst.id, template: inst.template, params: inst.params }, `event:${inst.id}`);
}
