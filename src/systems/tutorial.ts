import type { World } from '../core/world';
import { post } from './economy';
import { roomInService } from './rules';

export interface TutorialStepDef {
  id: string;
  titleSv: string;
  textSv: string;
  manual: boolean;
}

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  { id: 'welcome', titleSv: 'Välkommen, direktör!', textSv: 'Du styr en liten vårdmottagning. Patienter och personal sköter sig själva – du bygger, anställer och prioriterar. Den första patienten är på väg in genom entrén längst ner.', manual: false },
  { id: 'journey', titleSv: 'Patientens resa', textSv: 'Följ patienten: först receptionen, sedan väntrummet, läkarbesöket och behandlingsrummet. Tryck på en patient för att se hälsa, tålamod och nästa steg.', manual: false },
  { id: 'queue', titleSv: 'Köerna', textSv: 'Siffrorna ovanför rummen visar hur många som väntar. När köerna växer blir patienterna otåliga och ryktet sjunker. Tryck ”Nästa” när du är redo.', manual: true },
  { id: 'build', titleSv: 'Bygg ett mottagningsrum till', textSv: 'Öppna Bygg, välj Mottagningsrum och dra en rektangel (minst 4×4) intill en korridor. Kontrollera priset och tryck Bygg.', manual: false },
  { id: 'hire', titleSv: 'Anställ en läkare', textSv: 'Ett rum utan personal gör ingen nytta. Öppna Personal, anställ en läkare och placera hen i det nya mottagningsrummet.', manual: false },
  { id: 'effect', titleSv: 'Följ effekten', textSv: 'Öppna Analys och se väntetider och ekonomi. Ett nytt rum kostar pengar direkt – efterfrågan växer först när ryktet blir bättre. Det är helt normalt!', manual: true },
];

export function tutorialCheck(w: World): void {
  const t = w.state.tutorial;
  if (t.done || w.tick % 10 !== 0) return;
  const step = TUTORIAL_STEPS[t.step];
  if (!step) return;
  switch (step.id) {
    case 'welcome':
      if (w.state.metrics.totals.arrivals > 0) t.step++;
      break;
    case 'journey':
      if (w.state.metrics.totals.completed + w.state.metrics.totals.referrals > 0) t.step++;
      break;
    case 'build':
      if (w.state.rooms.filter((r) => r.type === 'R03').length >= 2) t.step++;
      break;
    case 'hire':
      if (w.state.rooms.filter((r) => r.type === 'R03' && roomInService(w, r)).length >= 2) t.step++;
      break;
  }
}

function completeTutorial(w: World): void {
  const t = w.state.tutorial;
  t.done = true;
  // One-time reward, permanently marked in the save so reloading cannot claim it again.
  if (!t.rewardsClaimed.includes('tutorial-complete') && !t.skipped) {
    t.rewardsClaimed.push('tutorial-complete');
    post(w, 2000, 'grant', 'Handledning klar – startbidrag', 'tutorial');
  }
}

export function tutorialCommand(w: World, action: 'advance' | 'skip' | 'restart' | 'complete'): { ok: boolean; errorsSv: string[] } {
  const t = w.state.tutorial;
  switch (action) {
    case 'skip':
      t.done = true;
      t.skipped = true;
      return { ok: true, errorsSv: [] };
    case 'restart':
      t.done = false;
      t.skipped = false;
      t.step = 0;
      return { ok: true, errorsSv: [] };
    case 'advance':
    case 'complete': {
      if (t.done) return { ok: false, errorsSv: ['Handledningen är redan klar'] };
      const step = TUTORIAL_STEPS[t.step];
      if (!step) return { ok: false, errorsSv: ['Okänt steg'] };
      if (!step.manual && action === 'advance') return { ok: false, errorsSv: ['Det här steget klaras av genom att spela'] };
      if (t.step >= TUTORIAL_STEPS.length - 1) completeTutorial(w);
      else t.step++;
      return { ok: true, errorsSv: [] };
    }
  }
}
