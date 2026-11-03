import { DEF } from '../data/definition';
import type { World } from '../core/world';
import { clamp, onDuty } from './rules';

/** Operational pressure score P (0–100) used by the event director. */
export function pressureScore(w: World): { total: number; queue: number; economy: number; staff: number; events: number } {
  const stations = w.state.rooms.reduce((s, r) => s + (DEF.room[r.type].team.length ? r.layout.stations.length : 0), 0);
  const queueLen = w.state.queues.length;
  const today = w.state.metrics.today;
  const avgWait = today.waitCount ? today.waitSum / today.waitCount : 0;
  const queue = clamp(Math.max((queueLen / Math.max(1, stations)) * 25, (avgWait / 60) * 100), 0, 100);
  const economy = { none: 0, warning: 40, crisis: 75, recovery: 100 }[w.state.economy.crisis];
  const duty = w.state.staff.filter((s) => onDuty(w, s));
  const staff = duty.length ? clamp(duty.reduce((s, x) => s + x.stress + (100 - x.energy) / 2, 0) / duty.length, 0, 100) : 0;
  const events = clamp(w.state.events.active.filter((e) => !e.ended).reduce((s, e) => s + DEF.event[e.template].pressure, 0), 0, 100);
  const total = clamp(0.35 * queue + 0.3 * economy + 0.2 * staff + 0.15 * events, 0, 100);
  return { total, queue, economy, staff, events };
}
