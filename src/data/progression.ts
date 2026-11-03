import type { ChapterDef, EventTemplateDef, MissionTemplateDef, ProjectDef } from './types';

export const PROJECTS: ProjectDef[] = [
  { id: 'F01', nameSv: 'Digital patientjournal', descriptionSv: 'Slut på pärmar. Receptionen arbetar 10 % snabbare.', grp: 40, chapter: 2, requires: [], effect: { kind: 'stepSpeed', steps: ['REG'], value: 0.1 }, hours: 6 },
  { id: 'F02', nameSv: 'Snabbare provanalys', descriptionSv: 'Centrifuger med turboläge. Laboratoriet 10 % snabbare.', grp: 80, chapter: 2, requires: [], effect: { kind: 'stepSpeed', steps: ['L'], value: 0.1 }, hours: 8 },
  { id: 'F03', nameSv: 'Effektiv vårdlogistik', descriptionSv: 'Smartare skyltning. Gångtiderna minskar med 8 %.', grp: 120, chapter: 2, requires: [], effect: { kind: 'travel', value: 0.08 }, hours: 10 },
  { id: 'F04', nameSv: 'Förbättrad röntgenteknik', descriptionSv: 'Skarpare bilder på kortare tid. Röntgen 12 % snabbare.', grp: 160, chapter: 3, requires: ['F02'], effect: { kind: 'stepSpeed', steps: ['X'], value: 0.12 }, hours: 12 },
  { id: 'F05', nameSv: 'Optimerad akutmottagning', descriptionSv: 'Tydligare triage. Akuten 10 % snabbare.', grp: 180, chapter: 3, requires: [], effect: { kind: 'stepSpeed', steps: ['E'], value: 0.1 }, hours: 12 },
  { id: 'F06', nameSv: 'Automatiserad administration', descriptionSv: 'Blanketterna fyller i sig själva. Receptionen ytterligare 15 % snabbare.', grp: 200, chapter: 3, requires: ['F01'], effect: { kind: 'stepSpeed', steps: ['REG'], value: 0.15 }, hours: 12 },
  { id: 'F07', nameSv: 'Specialistutbildningsprogram', descriptionSv: 'Egen utbildningsakademi. Utbildningar kostar 15 % mindre.', grp: 250, chapter: 3, requires: [], effect: { kind: 'trainingCost', value: 0.15 }, hours: 14 },
  { id: 'F08', nameSv: 'Förbättrad operationsmetod', descriptionSv: 'Mindre snitt, kortare tider. Operation 10 % snabbare.', grp: 350, chapter: 4, requires: ['F05'], effect: { kind: 'stepSpeed', steps: ['OP'], value: 0.1 }, hours: 16 },
  { id: 'F09', nameSv: 'Avancerad intensivvård', descriptionSv: 'Nya övervakningsrutiner. Intensivvårdens kvalitet +10.', grp: 400, chapter: 4, requires: ['F08'], effect: { kind: 'stepQuality', steps: ['IVA'], value: 10 }, hours: 18 },
  { id: 'F10', nameSv: 'Forskningssamordning', descriptionSv: 'Gemensam forskningsplan. Allmän forskningsproduktion +15 %.', grp: 450, chapter: 4, requires: ['F07'], effect: { kind: 'grpProduction', value: 0.15 }, hours: 18 },
  { id: 'F11', nameSv: 'Experimentell medicinteknik', descriptionSv: 'Prototyper som oftast fungerar. Experimentell vård 15 % snabbare.', grp: 600, chapter: 5, requires: ['F10'], effect: { kind: 'stepSpeed', steps: ['EX'], value: 0.15 }, hours: 20 },
  { id: 'F12', nameSv: 'Medicinsk robotik', descriptionSv: 'Robotarna får uppdaterad firmware. Robotkliniken 15 % snabbare.', grp: 750, chapter: 5, requires: ['F11'], effect: { kind: 'stepSpeed', steps: ['RB'], value: 0.15 }, hours: 24 },
];

export const MISSIONS: MissionTemplateDef[] = [
  { id: 'M01', nameSv: 'Minska väntetiden', descriptionSv: 'Få ner den genomsnittliga väntetiden under {target} minuter.', triggerSv: 'Långa väntetider', minChapter: 1, durationDays: [2, 4], rewardRange: [1500, 5000], cooldownDays: 3, reputationReward: 2, grpReward: 0 },
  { id: 'M02', nameSv: 'Förbättra vårdkvaliteten', descriptionSv: 'Nå minst {target} % lyckade behandlingar.', triggerSv: 'Låg vårdkvalitet', minChapter: 1, durationDays: [3, 5], rewardRange: [2000, 6000], cooldownDays: 4, reputationReward: 2, grpReward: 0 },
  { id: 'M03', nameSv: 'Effektivisera avdelningen', descriptionSv: 'Genomför minst {target} behandlingar i {room}.', triggerSv: 'Hög beläggning eller låg genomströmning', minChapter: 1, durationDays: [2, 4], rewardRange: [1500, 5000], cooldownDays: 3, reputationReward: 0, grpReward: 5 },
  { id: 'M04', nameSv: 'Rädda ekonomin', descriptionSv: 'Gå med minst {target} kr i rörelseresultat under uppdraget.', triggerSv: 'Negativt kassaflöde', minChapter: 1, durationDays: [3, 5], rewardRange: [2000, 6000], cooldownDays: 5, reputationReward: 0, grpReward: 0 },
  { id: 'M05', nameSv: 'Utbilda personalen', descriptionSv: 'Slutför {target} utbildningar.', triggerSv: 'Kompetensbrist', minChapter: 1, durationDays: [3, 5], rewardRange: [2000, 6000], cooldownDays: 5, reputationReward: 1, grpReward: 0 },
  { id: 'M06', nameSv: 'Öka patientnöjdheten', descriptionSv: 'Höj genomsnittlig patientnöjdhet till minst {target}.', triggerSv: 'Låg patientnöjdhet', minChapter: 1, durationDays: [2, 4], rewardRange: [1500, 5000], cooldownDays: 4, reputationReward: 3, grpReward: 0 },
  { id: 'M07', nameSv: 'Identifiera en sjukdom', descriptionSv: 'Identifiera {disease}.', triggerSv: 'Okänd sjukdom observerad', minChapter: 2, durationDays: [3, 5], rewardRange: [2500, 8000], cooldownDays: 3, reputationReward: 1, grpReward: 10 },
  { id: 'M08', nameSv: 'Bemästra en sjukdom', descriptionSv: 'Bemästra {disease}.', triggerSv: 'Identifierad men ej bemästrad sjukdom', minChapter: 2, durationDays: [3, 5], rewardRange: [2500, 8000], cooldownDays: 3, reputationReward: 1, grpReward: 10 },
  { id: 'M09', nameSv: 'Minska personalstressen', descriptionSv: 'Få ner genomsnittlig personalstress under {target}.', triggerSv: 'Trött eller stressad personal', minChapter: 1, durationDays: [2, 4], rewardRange: [1000, 4000], cooldownDays: 4, reputationReward: 0, grpReward: 0 },
  { id: 'M10', nameSv: 'Förbättra logistiken', descriptionSv: 'Få ner genomsnittlig gångtid per patient under {target} minuter.', triggerSv: 'Långa gångtider', minChapter: 2, durationDays: [3, 5], rewardRange: [1500, 5000], cooldownDays: 5, reputationReward: 0, grpReward: 5 },
  { id: 'M11', nameSv: 'Klara patientrusningen', descriptionSv: 'Slutför vården för minst {target} patienter under rusningen.', triggerSv: 'Tillfälligt hög efterfrågan', minChapter: 2, durationDays: [2, 3], rewardRange: [2500, 8000], cooldownDays: 4, reputationReward: 2, grpReward: 0 },
  { id: 'M12', nameSv: 'Slutför forskning', descriptionSv: 'Slutför forskningsprojektet {project}.', triggerSv: 'Forskningsmöjlighet', minChapter: 2, durationDays: [3, 5], rewardRange: [2000, 6000], cooldownDays: 4, reputationReward: 0, grpReward: 15 },
];

export const EVENTS: EventTemplateDef[] = [
  { id: 'E01', nameSv: 'Kaffemaskinen strejkar', textSv: 'Kaffemaskinen har gått med i facket och vägrar brygga en droppe till. Personalen stirrar tomt på väggen.', chapter: 1, severity: 'minor', polarity: 'negative', durationHours: 24, pressure: 15, options: [
    { id: 'repair', labelSv: 'Ring reparatören (800 kr)', consequenceSv: 'Återhämtningen i personalrummet sänks bara i 8 timmar.' },
    { id: 'endure', labelSv: 'Vatten är också dryck', consequenceSv: 'Återhämtningen i personalrummet sänks med 40 % i ett dygn.' },
  ] },
  { id: 'E02', nameSv: 'En patient har blivit influencer', textSv: 'En patient livesänder hela sitt besök till 80 000 följare. Varje väntande minut kommenteras.', chapter: 1, severity: 'minor', polarity: 'neutral', durationHours: 24, pressure: 10, options: [
    { id: 'vip', labelSv: 'Ge VIP-bemötande (500 kr)', consequenceSv: 'Ryktet påverkas starkare av patientnöjdheten – men vi bjuder på fikat.' },
    { id: 'normal', labelSv: 'Alla behandlas lika', consequenceSv: 'Ryktet påverkas av hur nöjda patienterna faktiskt är.' },
  ] },
  { id: 'E03', nameSv: 'Mystiskt kontorsmöte', textSv: 'Någon har bokat ett möte om mötesbokning. Receptionen har blivit kallad.', chapter: 2, severity: 'minor', polarity: 'negative', durationHours: 8, pressure: 15, options: [
    { id: 'attend', labelSv: 'Gå på mötet', consequenceSv: 'Receptionen arbetar 35 % långsammare i 8 timmar.' },
    { id: 'decline', labelSv: 'Tacka nej (rykte −1)', consequenceSv: 'Ledningen blir sur, men receptionen arbetar som vanligt.' },
  ] },
  { id: 'E04', nameSv: 'Städpanik', textSv: 'Någon har tappat en hel pall glitter i korridoren. Det sprider sig.', chapter: 2, severity: 'minor', polarity: 'negative', durationHours: 12, pressure: 20, options: [
    { id: 'extra', labelSv: 'Hyr extrastädare (1 200 kr)', consequenceSv: 'Smutsen ökar bara lite i 12 timmar.' },
    { id: 'cope', labelSv: 'Vi klarar oss', consequenceSv: 'Rummen blir smutsiga dubbelt så fort i 12 timmar.' },
  ] },
  { id: 'E05', nameSv: 'Kvalitetsinspektion', textSv: 'En inspektör med klippbräda och misstänksam blick granskar servicen i två dagar.', chapter: 2, severity: 'major', polarity: 'neutral', durationHours: 48, pressure: 30, options: [
    { id: 'welcome', labelSv: 'Välkomna inspektören', consequenceSv: 'Bra service ger rykte och bonus, dålig service kostar rykte.' },
  ] },
  { id: 'E06', nameSv: 'Influensavåg', textSv: 'Halva stan nyser i kör. Väntrummet fylls snabbare än vanligt.', chapter: 2, severity: 'major', polarity: 'negative', durationHours: 48, pressure: 40, options: [
    { id: 'prepare', labelSv: 'Förbered extra resurser', consequenceSv: 'Efterfrågan +25 % i två dygn.' },
  ] },
  { id: 'E07', nameSv: 'Röntgenhaveri', textSv: 'Röntgenapparaten visar bara bilder på katter. Tekniker är tillkallade.', chapter: 3, severity: 'major', polarity: 'negative', durationHours: 12, pressure: 45, options: [
    { id: 'express', labelSv: 'Expressreparation (4 000 kr)', consequenceSv: 'Röntgen är stängd i 3 timmar.' },
    { id: 'wait', labelSv: 'Vänta på ordinarie service', consequenceSv: 'Röntgen är stängd i 12 timmar.' },
  ] },
  { id: 'E08', nameSv: 'Personalbrist', textSv: 'En medarbetare har fått vattkoppor. Eller påstår det i alla fall.', chapter: 3, severity: 'major', polarity: 'negative', durationHours: 24, pressure: 40, options: [
    { id: 'rest', labelSv: 'Krya på dig!', consequenceSv: 'Medarbetaren är borta i ett dygn.' },
    { id: 'temp', labelSv: 'Hyr bemanning (2 500 kr)', consequenceSv: 'Medarbetaren är borta i 8 timmar.' },
  ] },
  { id: 'E09', nameSv: 'Oväntad donation', textSv: 'En tacksam före detta patient skänker pengar. ”Tack för att ni fixade min måndag!”', chapter: 3, severity: 'minor', polarity: 'positive', durationHours: 1, pressure: 0, options: [
    { id: 'accept', labelSv: 'Tacka och ta emot', consequenceSv: 'Kassan ökar.' },
  ] },
  { id: 'E10', nameSv: 'Operationsrusning', textSv: 'En lokal tävling i trampolinhopp har gått precis så illa som alla trodde.', chapter: 4, severity: 'major', polarity: 'neutral', durationHours: 24, pressure: 35, options: [
    { id: 'go', labelSv: 'Kirurgerna till start!', consequenceSv: 'Fler kirurgiska fall i ett dygn.' },
  ] },
  { id: 'E11', nameSv: 'Forskningsgenombrott', textSv: 'Någon glömde en macka i labbet och upptäckte något fantastiskt.', chapter: 4, severity: 'minor', polarity: 'positive', durationHours: 1, pressure: 0, options: [
    { id: 'publish', labelSv: 'Publicera!', consequenceSv: '+50 allmänna forskningspoäng.' },
  ] },
  { id: 'E12', nameSv: 'Robotarna kräver semester', textSv: 'Robotarna har läst arbetsmiljölagen och kräver ledighet.', chapter: 5, severity: 'major', polarity: 'negative', durationHours: 24, pressure: 40, options: [
    { id: 'negotiate', labelSv: 'Förhandla (3 000 kr)', consequenceSv: 'Robotkliniken arbetar 20 % långsammare i 8 timmar.' },
    { id: 'refuse', labelSv: 'Robotar har inga rättigheter', consequenceSv: 'Robotkliniken arbetar 50 % långsammare i ett dygn.' },
  ] },
];

export const CHAPTERS: ChapterDef[] = [
  { id: 1, titleSv: 'En mottagning med ambitioner', introSv: 'Du har tagit över en liten vårdmottagning med fyra rum och tre anställda. Bevisa att ni kan bli något större.', grant: 15000, unlockSummarySv: 'Provtagning, laboratorium, apotek, städcentral, grundforskning och första markutbyggnaden.', requirements: [
    { id: 'c1-patients', kind: 'completedPatients', target: 40, labelSv: 'Slutför vården för 40 patienter' },
    { id: 'c1-consult', kind: 'operationalRooms', target: 2, roomType: 'R03', labelSv: 'Två bemannade mottagningsrum' },
    { id: 'c1-rep', kind: 'reputation', target: 55, labelSv: 'Rykte minst 55' },
    { id: 'c1-result', kind: 'positiveResultDays', target: 1, window: 3, labelSv: 'Positivt rörelseresultat de senaste 3 dagarna' },
  ] },
  { id: 2, titleSv: 'Vårdcentralen växer', introSv: 'Nu kommer patienter med krångligare besvär. Bygg upp diagnostiken och lär dig sjukdomarna.', grant: 25000, unlockSummarySv: 'Röntgen, akutmottagning, ortopedi, nya yrkesroller och andra markutbyggnaden.', requirements: [
    { id: 'c2-patients', kind: 'completedPatients', target: 150, labelSv: 'Slutför vården för 150 patienter totalt' },
    { id: 'c2-diag', kind: 'diagnosticExams', target: 30, labelSv: '30 diagnostiska undersökningar' },
    { id: 'c2-ident', kind: 'identifiedDiseases', target: 6, labelSv: 'Minst 6 identifierade sjukdomar' },
    { id: 'c2-rep', kind: 'reputation', target: 65, labelSv: 'Rykte minst 65' },
    { id: 'c2-success', kind: 'successRate7d', target: 70, window: 7, minSample: 30, labelSv: 'Minst 70 % lyckade behandlingar senaste 7 dagarna' },
  ] },
  { id: 3, titleSv: 'Sjukhuset börjar på riktigt', introSv: 'Ambulanserna har hittat hit. Akuten, röntgen och ortopedin avgör om ni klarar trycket.', grant: 40000, unlockSummarySv: 'Operationssal, vårdavdelning och intensivvård.', requirements: [
    { id: 'c3-patients', kind: 'completedPatients', target: 400, labelSv: 'Slutför vården för 400 patienter totalt' },
    { id: 'c3-xray', kind: 'operationalRooms', target: 1, roomType: 'R08', labelSv: 'Bemannad röntgen' },
    { id: 'c3-er', kind: 'operationalRooms', target: 1, roomType: 'R09', labelSv: 'Bemannad akutmottagning' },
    { id: 'c3-rep', kind: 'reputation', target: 75, labelSv: 'Rykte minst 75' },
    { id: 'c3-wait', kind: 'avgWait5d', target: 45, window: 5, minSample: 40, labelSv: 'Snittväntetid under 45 min senaste 5 dagarna' },
    { id: 'c3-trained', kind: 'trainedSpecialists', target: 4, labelSv: '4 vidareutbildade medarbetare (minst 50 i akut, bild eller ortopedi)' },
  ] },
  { id: 4, titleSv: 'Regionsjukhuset', introSv: 'Operationer, inneliggande vård och intensivvård. Nu är ni ett riktigt sjukhus.', grant: 65000, unlockSummarySv: 'Forskningslabb, experimentell vård, robotklinik, sista markutbyggnaden och sena sjukdomar.', requirements: [
    { id: 'c4-patients', kind: 'completedPatients', target: 800, labelSv: 'Slutför vården för 800 patienter totalt' },
    { id: 'c4-adv', kind: 'advancedTreatments', target: 30, labelSv: '30 avancerade behandlingar (ortopedi, operation eller IVA)' },
    { id: 'c4-spec', kind: 'specialistDepartments', target: 3, labelSv: '3 olika specialistavdelningar i drift' },
    { id: 'c4-rep', kind: 'reputation', target: 85, labelSv: 'Rykte minst 85' },
    { id: 'c4-cash', kind: 'positiveCashflowDays', target: 5, window: 7, labelSv: 'Positivt kassaflöde minst 5 av de senaste 7 dagarna' },
  ] },
  { id: 5, titleSv: 'Det ultimata sjukhuset', introSv: 'Mystiska sjukdomar, robotar och en sjudagars slutinspektion står mellan dig och Det gyllene stetoskopet.', grant: 0, unlockSummarySv: 'Det gyllene stetoskopet.', requirements: [
    { id: 'c5-patients', kind: 'completedPatients', target: 1200, labelSv: 'Slutför vården för 1 200 patienter totalt' },
    { id: 'c5-mastered', kind: 'masteredDiseases', target: 18, labelSv: 'Bemästra 18 sjukdomar' },
    { id: 'c5-rep', kind: 'reputation', target: 90, labelSv: 'Rykte minst 90' },
    { id: 'c5-depts', kind: 'finalDepartments', target: 1, labelSv: 'Alla slutavdelningar i drift' },
    { id: 'c5-debt', kind: 'noOverdueDebt', target: 1, labelSv: 'Inga förfallna skulder' },
  ] },
];

/** Final inspection rules (chapter 5). */
export const FINAL_INSPECTION = {
  days: 7,
  minCompletedPerDay: 20,
  minSuccessRate: 85,
  maxAvgWait: 35,
  minReputationEnd: 90,
  requiredRooms: ['R08', 'R09', 'R10', 'R13', 'R14', 'R15', 'R17', 'R18'] as const,
};
