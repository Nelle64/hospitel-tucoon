import { DEF } from '../data/definition';
import type { World } from './world';

/** Validates cross-entity invariants. Returns human-readable violations (empty = healthy). */
export function checkInvariants(w: World): string[] {
  const v: string[] = [];
  const s = w.state;
  if (!Number.isInteger(s.economy.cash)) v.push(`cash not integer: ${s.economy.cash}`);
  // Index consistency.
  if (w.patientById.size !== s.patients.length) v.push('patient index out of sync');
  if (w.staffById.size !== s.staff.length) v.push('staff index out of sync');
  if (w.resById.size !== s.reservations.length) v.push('reservation index out of sync');
  if (w.caseById.size !== s.cases.length) v.push('case index out of sync');
  const stationUse = new Map<string, number>();
  const staffRes = new Map<number, number>();
  const patientRes = new Map<number, number>();
  const bedCount = new Map<number, number>();
  for (const r of s.reservations) {
    const p = w.patientById.get(r.patientId);
    const room = w.roomById.get(r.roomId);
    if (!p) v.push(`reservation ${r.id} references missing patient ${r.patientId}`);
    if (!w.caseById.get(r.caseId)) v.push(`reservation ${r.id} references missing case`);
    if (!room) v.push(`reservation ${r.id} references missing room ${r.roomId}`);
    else if (!room.layout.stations[r.station]) v.push(`reservation ${r.id} invalid station`);
    if (p && p.reservationId !== r.id) v.push(`patient ${p.id} reservation mismatch (${p.reservationId} vs ${r.id})`);
    const key = `${r.roomId}:${r.station}`;
    stationUse.set(key, (stationUse.get(key) ?? 0) + 1);
    patientRes.set(r.patientId, (patientRes.get(r.patientId) ?? 0) + 1);
    for (const sid of r.staffIds) {
      staffRes.set(sid, (staffRes.get(sid) ?? 0) + 1);
      const st = w.staffById.get(sid);
      if (!st) v.push(`reservation ${r.id} references missing staff ${sid}`);
      else if (!(st.task.kind === 'work' && st.task.reservationId === r.id)) v.push(`staff ${sid} not bound to reservation ${r.id}`);
      else if (st.state === 'TRAINING' || st.training) v.push(`staff ${sid} working while training`);
    }
    if (room && DEF.room[room.type].stationKind === 'bed') bedCount.set(room.id, (bedCount.get(room.id) ?? 0) + 1);
    if (r.status !== 'RESERVED' && r.status !== 'MOVING' && r.status !== 'ACTIVE') v.push(`reservation ${r.id} invalid status`);
  }
  for (const [k, n] of stationUse) if (n > 1) v.push(`station ${k} double booked (${n})`);
  for (const [pid, n] of patientRes) if (n > 1) v.push(`patient ${pid} has ${n} reservations`);
  for (const [sid, n] of staffRes) if (n > 1) v.push(`staff ${sid} has ${n} reservations`);
  for (const [rid, n] of bedCount) {
    const room = w.roomById.get(rid)!;
    if (n > room.layout.stations.length) v.push(`room ${rid} over bed capacity`);
  }
  for (const st of s.staff) {
    if (st.task.kind === 'work' && !w.resById.has(st.task.reservationId)) v.push(`staff ${st.id} bound to missing reservation`);
    if (st.roomId && !w.roomById.has(st.roomId)) v.push(`staff ${st.id} assigned to missing room`);
    if (st.training && st.onSite) v.push(`staff ${st.id} on site during training`);
    if (st.energy < 0 || st.energy > 100 || st.stress < 0 || st.stress > 100) v.push(`staff ${st.id} energy/stress out of range`);
  }
  const queued = new Map<number, number>();
  for (const e of s.queues) {
    queued.set(e.patientId, (queued.get(e.patientId) ?? 0) + 1);
    const p = w.patientById.get(e.patientId);
    if (!p) v.push(`queue entry for missing patient ${e.patientId}`);
    else if (p.queueStep !== e.step) v.push(`patient ${p.id} queue step mismatch`);
    else if (p.reservationId) v.push(`patient ${p.id} queued while holding reservation`);
  }
  for (const [pid, n] of queued) if (n > 1) v.push(`patient ${pid} in ${n} queues`);
  const seats = new Set<string>();
  for (const p of s.patients) {
    const c = w.caseById.get(p.caseId);
    if (!c) v.push(`patient ${p.id} without case`);
    if (p.queueStep && !queued.has(p.id)) v.push(`patient ${p.id} has queueStep without entry`);
    if (p.reservationId && !w.resById.has(p.reservationId)) v.push(`patient ${p.id} references missing reservation`);
    if (p.seat) {
      const k = `${p.seat.roomId}:${p.seat.station}`;
      if (seats.has(k)) v.push(`seat ${k} double occupied`);
      seats.add(k);
      if (!w.roomById.has(p.seat.roomId)) v.push(`patient ${p.id} seated in missing room`);
    }
    if (p.health < 0 || p.health > 100) v.push(`patient ${p.id} health out of range`);
    if (c && c.outcome && p.state !== 'EXITING') v.push(`patient ${p.id} closed case but state ${p.state}`);
    if (['COMPLETED', 'REFERRED', 'ABANDONED', 'FAILED'].includes(p.state)) v.push(`terminal patient ${p.id} still active`);
  }
  const settled = new Set<number>();
  for (const id of s.economy.settledCaseIds) {
    if (settled.has(id)) v.push(`duplicate settlement for case ${id}`);
    settled.add(id);
  }
  for (const c of s.cases) {
    if (c.settled !== (c.outcome !== null)) v.push(`case ${c.id} settlement flag mismatch`);
    if (!w.patientById.has(c.patientId)) v.push(`case ${c.id} without patient`);
  }
  for (const r of s.rooms) if (r.cleanliness < 0 || r.cleanliness > 100) v.push(`room ${r.id} cleanliness out of range`);
  if (s.log.length > DEF.sim.eventLogSize) v.push('event log exceeds retention');
  return v;
}
