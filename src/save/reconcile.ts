import type { World } from '../core/world';

/**
 * Post-load reconciliation: derived structures are rebuilt by World.reindex(); here we repair any
 * stale cross references so that no reservation, queue entry or task survives a load unvalidated.
 * Returns a list of repairs (empty for a healthy save).
 */
export function reconcile(w: World): string[] {
  const s = w.state;
  const repairs: string[] = [];
  for (const r of s.reservations.slice()) {
    const ok = w.patientById.has(r.patientId) && w.caseById.has(r.caseId) && w.roomById.get(r.roomId)?.layout.stations[r.station] && r.staffIds.every((id) => w.staffById.has(id));
    if (!ok) {
      repairs.push(`removed stale reservation ${r.id}`);
      const p = w.patientById.get(r.patientId);
      if (p && p.reservationId === r.id) p.reservationId = 0;
      for (const id of r.staffIds) {
        const st = w.staffById.get(id);
        if (st && st.task.kind === 'work' && st.task.reservationId === r.id) st.task = { kind: 'none' };
      }
      w.removeReservation(r.id);
    }
  }
  for (const st of s.staff) {
    if (st.task.kind === 'work' && !w.resById.has(st.task.reservationId)) {
      st.task = { kind: 'none' };
      repairs.push(`reset task of staff ${st.id}`);
    }
    if (st.roomId && !w.roomById.has(st.roomId)) {
      st.roomId = 0;
      repairs.push(`unassigned staff ${st.id} from missing room`);
    }
  }
  const before = s.queues.length;
  s.queues = s.queues.filter((e) => {
    const p = w.patientById.get(e.patientId);
    return !!p && p.queueStep === e.step && !p.reservationId;
  });
  if (s.queues.length !== before) repairs.push(`removed ${before - s.queues.length} stale queue entries`);
  const queued = new Set(s.queues.map((e) => e.patientId));
  for (const p of s.patients) {
    if (p.reservationId && !w.resById.has(p.reservationId)) {
      p.reservationId = 0;
      repairs.push(`cleared missing reservation of patient ${p.id}`);
    }
    if (p.queueStep && !queued.has(p.id)) {
      s.queues.push({ patientId: p.id, step: p.queueStep, enqueuedTick: p.enqueuedTick });
      repairs.push(`re-queued patient ${p.id}`);
    }
    if (p.seat && !w.roomById.has(p.seat.roomId)) p.seat = null;
  }
  if (repairs.length) w.matchDirty = true;
  return repairs;
}
