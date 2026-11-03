import type { RoleDef, SkillDef, TrainingDef } from './types';

export const SKILLS: SkillDef[] = [
  { id: 'SK01', nameSv: 'Diagnostik', effectSv: 'Träffsäkerhet och kvalitet vid läkarbesök' },
  { id: 'SK02', nameSv: 'Behandlingstempo', effectSv: 'Snabbare behandlingar' },
  { id: 'SK03', nameSv: 'Omvårdnad', effectSv: 'Bättre omvårdnad och avdelningsvård' },
  { id: 'SK04', nameSv: 'Akutsjukvård', effectSv: 'Bättre akutbehandling' },
  { id: 'SK05', nameSv: 'Laboratorieanalys', effectSv: 'Snabbare och bättre labbarbete' },
  { id: 'SK06', nameSv: 'Bilddiagnostik', effectSv: 'Bättre röntgenarbete' },
  { id: 'SK07', nameSv: 'Ortopedi', effectSv: 'Behörighet och kvalitet inom ortopedi' },
  { id: 'SK08', nameSv: 'Kirurgi', effectSv: 'Effektivare och säkrare operationer' },
  { id: 'SK09', nameSv: 'Intensivvård', effectSv: 'Effektivare intensivvård' },
  { id: 'SK10', nameSv: 'Forskning', effectSv: 'Högre forskningsproduktion' },
  { id: 'SK11', nameSv: 'Stresstålighet', effectSv: 'Lägre stressökning' },
  { id: 'SK12', nameSv: 'Administration och service', effectSv: 'Snabbare inskrivning och bättre bemötande' },
];

export const ROLES: RoleDef[] = [
  { id: 'S01', key: 'receptionist', nameSv: 'Receptionist', pluralSv: 'Receptionister', wage: 450, unlockChapter: 1, skillRanges: { SK12: [25, 60], SK11: [10, 50] }, substitutesFor: [], uniform: '#e8a33d' },
  { id: 'S02', key: 'nurse', nameSv: 'Sjuksköterska', pluralSv: 'Sjuksköterskor', wage: 650, unlockChapter: 1, skillRanges: { SK03: [25, 60], SK02: [15, 50], SK04: [0, 30], SK09: [0, 30], SK11: [10, 50] }, substitutesFor: [], uniform: '#5fa8d3' },
  { id: 'S03', key: 'doctor', nameSv: 'Läkare', pluralSv: 'Läkare', wage: 1200, unlockChapter: 1, skillRanges: { SK01: [25, 60], SK02: [15, 50], SK04: [0, 35], SK11: [10, 50] }, substitutesFor: [], uniform: '#f1f1f1' },
  { id: 'S04', key: 'labTech', nameSv: 'Biomedicinsk analytiker', pluralSv: 'Biomedicinska analytiker', wage: 750, unlockChapter: 2, skillRanges: { SK05: [25, 60], SK11: [10, 50] }, substitutesFor: [], uniform: '#9b5de5' },
  { id: 'S05', key: 'radiographer', nameSv: 'Röntgensjuksköterska', pluralSv: 'Röntgensjuksköterskor', wage: 900, unlockChapter: 3, skillRanges: { SK06: [25, 60], SK10: [0, 25], SK11: [10, 50] }, substitutesFor: [], uniform: '#5c6bc0' },
  { id: 'S06', key: 'specialist', nameSv: 'Specialistläkare', pluralSv: 'Specialistläkare', wage: 1650, unlockChapter: 3, skillRanges: { SK01: [35, 70], SK02: [20, 50], SK07: [10, 55], SK09: [10, 50], SK04: [10, 40], SK11: [15, 55] }, substitutesFor: ['S03'], uniform: '#2a9d8f' },
  { id: 'S07', key: 'surgeon', nameSv: 'Kirurg', pluralSv: 'Kirurger', wage: 2000, unlockChapter: 4, skillRanges: { SK08: [25, 65], SK02: [15, 45], SK11: [15, 55] }, substitutesFor: [], uniform: '#3a7d44' },
  { id: 'S08', key: 'cleaner', nameSv: 'Lokalvårdare', pluralSv: 'Lokalvårdare', wage: 400, unlockChapter: 2, skillRanges: { SK02: [10, 40], SK11: [10, 50] }, substitutesFor: [], uniform: '#90be6d' },
  { id: 'S09', key: 'researcher', nameSv: 'Forskare', pluralSv: 'Forskare', wage: 1100, unlockChapter: 5, skillRanges: { SK10: [30, 65], SK01: [10, 40], SK11: [10, 45] }, substitutesFor: [], uniform: '#7b2cbf' },
];

const TREATING: TrainingDef['roles'] = ['S02', 'S03', 'S06', 'S07'];
const ALL: TrainingDef['roles'] = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09'];

export const TRAININGS: TrainingDef[] = [
  { id: 'T01', nameSv: 'Diagnostik I', cost: 2000, days: 1, skill: 'SK01', gain: 15, roles: ['S03', 'S06'], advanced: false },
  { id: 'T02', nameSv: 'Snabb behandling', cost: 2500, days: 1, skill: 'SK02', gain: 15, roles: TREATING, advanced: false },
  { id: 'T03', nameSv: 'Omvårdnad I', cost: 2000, days: 1, skill: 'SK03', gain: 15, roles: ['S02'], advanced: false },
  { id: 'T04', nameSv: 'Akutsjukvård I', cost: 3500, days: 2, skill: 'SK04', gain: 20, roles: ['S03', 'S02', 'S06'], advanced: true },
  { id: 'T05', nameSv: 'Laboratorie I', cost: 3000, days: 1, skill: 'SK05', gain: 15, roles: ['S04'], advanced: false },
  { id: 'T06', nameSv: 'Bilddiagnostik I', cost: 3500, days: 2, skill: 'SK06', gain: 20, roles: ['S05'], advanced: true },
  { id: 'T07', nameSv: 'Ortopedi I', cost: 5000, days: 2, skill: 'SK07', gain: 25, roles: ['S06'], advanced: true },
  { id: 'T08', nameSv: 'Kirurgi I', cost: 6000, days: 3, skill: 'SK08', gain: 25, roles: ['S07'], advanced: true },
  { id: 'T09', nameSv: 'Intensivvård I', cost: 5500, days: 2, skill: 'SK09', gain: 20, roles: ['S06', 'S02'], advanced: true },
  { id: 'T10', nameSv: 'Forskning I', cost: 4000, days: 2, skill: 'SK10', gain: 20, roles: ['S09'], advanced: true },
  { id: 'T11', nameSv: 'Stresstålighet', cost: 3000, days: 1, skill: 'SK11', gain: 15, roles: ALL, advanced: false },
  { id: 'T12', nameSv: 'Patientbemötande', cost: 1500, days: 1, skill: 'SK12', gain: 15, roles: ['S01'], advanced: false },
];

export const FIRST_NAMES = [
  'Agnes', 'Alva', 'Astrid', 'Ebba', 'Elsa', 'Freja', 'Greta', 'Hedda', 'Ida', 'Ines', 'Juni', 'Klara', 'Lova', 'Maja', 'Märta', 'Nova',
  'Saga', 'Selma', 'Stina', 'Tilda', 'Vera', 'Wilma', 'Yrsa', 'Åsa', 'Anton', 'Arvid', 'Axel', 'Bertil', 'Bo', 'Edvin', 'Elis', 'Folke',
  'Gustav', 'Hugo', 'Ivar', 'Jonte', 'Kalle', 'Leo', 'Ludvig', 'Malte', 'Nils', 'Olle', 'Otto', 'Sixten', 'Sune', 'Tage', 'Vilgot', 'Örjan',
  'Kim', 'Robin', 'Sam', 'Alex', 'Charlie', 'Nour', 'Amir', 'Leila', 'Mio', 'Aisha', 'Yusuf', 'Mika', 'Ronja', 'Tove',
];
export const LAST_NAMES = [
  'Andersson', 'Bergström', 'Dahl', 'Ek', 'Forsberg', 'Gran', 'Holm', 'Isaksson', 'Jansson', 'Karlsson', 'Lind', 'Lundqvist',
  'Månsson', 'Nyberg', 'Olofsson', 'Persson', 'Qvist', 'Rask', 'Sandberg', 'Strand', 'Thorén', 'Ulfsson', 'Vik', 'Wallin',
  'Åberg', 'Öberg', 'Hassan', 'Nguyen', 'Kowalski', 'Virtanen', 'Pettersson', 'Sjöblom', 'Björk', 'Lövgren', 'Fjäll', 'Hägg',
];
export const TRAITS: { id: string; nameSv: string; effectSv: string }[] = [
  { id: 'calm', nameSv: 'Lugn', effectSv: 'Stress ökar 25 % långsammare' },
  { id: 'fast', nameSv: 'Snabbfotad', effectSv: 'Går snabbare' },
  { id: 'cheerful', nameSv: 'Glad', effectSv: 'Patienterna blir lite nöjdare' },
  { id: 'tireless', nameSv: 'Outtröttlig', effectSv: 'Energin sjunker 15 % långsammare' },
  { id: 'perfectionist', nameSv: 'Perfektionist', effectSv: '+3 kvalitet, 5 % långsammare' },
  { id: 'coffee', nameSv: 'Kaffeälskare', effectSv: 'Återhämtar sig snabbare i personalrummet' },
  { id: 'chatty', nameSv: 'Pratglad', effectSv: 'Lite långsammare men omtyckt' },
  { id: 'none', nameSv: 'Vanlig', effectSv: 'Inga särskilda egenskaper' },
];
