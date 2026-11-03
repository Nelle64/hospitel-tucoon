import type { PatientStateKind, StaffStateKind } from '../core/state';

export const PATIENT_STATE_SV: Record<PatientStateKind, string> = {
  ARRIVING: 'På väg in', REGISTERING: 'Skrivs in', WAITING: 'Väntar', WAITING_FOR_OPENING: 'Väntar på att avdelningen öppnar', MOVING: 'Går till behandling',
  IN_TREATMENT: 'Behandlas', NEXT_STEP: 'Nästa steg', EMERGENCY_ESCALATION: 'Akut försämring', EXITING: 'På väg hem', COMPLETED: 'Klar',
  REFERRED: 'Remitterad', ABANDONED: 'Gav upp', FAILED: 'Misslyckad vård',
};

export const STAFF_STATE_SV: Record<StaffStateKind, string> = {
  UNASSIGNED: 'Utan placering', IDLE: 'Ledig', MOVING: 'På väg', WORKING: 'Arbetar', RESTING: 'Vilar', TRAINING: 'På utbildning', UNAVAILABLE: 'Inte i tjänst', BLOCKED: 'Kommer inte fram',
};

export const OUTCOME_SV: Record<string, string> = { SUCCESS: 'Lyckad behandling', FAILED_TREATMENT: 'Misslyckad behandling', REFERRED: 'Remitterad', ABANDONED: 'Gav upp och gick', CRITICAL: 'Akut överflyttad' };

export const TRAIT_SV: Record<string, string> = { calm: 'Lugn', fast: 'Snabbfotad', cheerful: 'Glad', tireless: 'Outtröttlig', perfectionist: 'Perfektionist', coffee: 'Kaffeälskare', chatty: 'Pratglad' };

export const CRISIS_SV: Record<string, string> = { none: 'Stabil ekonomi', warning: 'Varning: tunn kassa', crisis: 'Ekonomisk kris', recovery: 'Återhämtningsläge' };

export const OVERLAY_SV: Record<string, string> = { none: 'Ingen', status: 'Driftstatus', utilization: 'Beläggning', queue: 'Köer', traffic: 'Gångtrafik' };

export const QUEUE_POLICY_SV: Record<number, string> = { 1: 'Medicinsk prioritet, sedan längst väntetid', 2: 'Medicinsk prioritet med extra rättvisa', 3: 'Medicinsk prioritet, sedan kortast behandling' };

export const PRIORITY_SV: Record<string, string> = { low: 'Låg', normal: 'Normal', high: 'Hög' };
