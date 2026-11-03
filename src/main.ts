import Phaser from 'phaser';
import './ui/styles.css';
import { GAME_DATA_VERSION } from './data/definition';
import { GameEngine } from './core/engine';
import { SCHEMA_VERSION } from './core/state';
import { DEF } from './data/definition';
import { GameApp, DEFAULT_SETTINGS, type Settings } from './app';
import { HospitalScene } from './render/scene';
import { InputController } from './render/input';
import { UI } from './ui/ui';
import { h, kr } from './ui/dom';
import { SaveManager } from './save/saveManager';
import { reconcile } from './save/reconcile';
import { APP_VERSION } from './save/envelope';
import { navStats } from './systems/navigation';

declare const __BUILD_ID__: string;
const BASE = import.meta.env.BASE_URL;
const mount = document.getElementById('app')!;

let saves: SaveManager | null = null;
let app: GameApp | null = null;
let ui: UI | null = null;
let game: Phaser.Game | null = null;
const errors: string[] = [];

function noteError(msg: string): void {
  errors.push(`${new Date().toISOString()} ${msg}`);
  if (errors.length > 20) errors.shift();
  app?.noteError(msg);
}
window.addEventListener('error', (e) => noteError(`Fel: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => noteError(`Fel: ${String((e as PromiseRejectionEvent).reason)}`));

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! >>> 1;
}

async function boot(): Promise<void> {
  try {
    saves = await SaveManager.open();
  } catch (err) {
    noteError(`IndexedDB otillgängligt: ${(err as Error).message}`);
  }
  const settings: Settings = saves ? await saves.getSettings(DEFAULT_SETTINGS) : { ...DEFAULT_SETTINGS };
  document.documentElement.classList.toggle('high-contrast', settings.highContrast);
  document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  await titleScreen(settings);
}

async function titleScreen(settings: Settings): Promise<void> {
  let existing: Awaited<ReturnType<SaveManager['loadCurrent']>> = null;
  let loadError: string | null = null;
  try {
    existing = saves ? await saves.loadCurrent() : null;
  } catch (err) {
    loadError = (err as Error).message;
    noteError(loadError);
  }
  const meta = existing?.state;
  const screen = h('div', { class: 'title-screen' },
    h('img', { class: 'title-logo', src: `${BASE}icons/icon-192.png`, alt: '' }),
    h('h1', null, 'Pixel Hospital'),
    h('p', { class: 'tagline' }, 'Bygg, bemanna och driv ditt eget sjukhus – från liten mottagning till regionens stolthet.'),
    meta ? h('button', { class: 'btn primary big', 'data-testid': 'continue', onclick: () => startGame(settings, new GameEngine(meta), existing!.recoveredFromPrevious) }, 'Fortsätt', h('small', null, `${meta.campaign.name} · dag ${Math.floor(meta.clock.tick / DEF.sim.ticksPerDay) + 1} · kapitel ${meta.progress.chapter} · ${kr(meta.economy.cash)}`)) : null,
    loadError ? h('div', { class: 'warnbox' }, h('b', null, 'Sparfilen kunde inte läsas.'), h('p', null, loadError), h('p', null, 'Ingenting har raderats. Du kan försöka igen, importera en exporterad sparfil eller starta ett nytt spel (den skadade filen ligger kvar).'), h('button', { class: 'btn', onclick: () => location.reload() }, 'Försök igen')) : null,
    h('button', { class: `btn ${meta ? '' : 'primary'} big`, 'data-testid': 'new-game', onclick: () => startGame(settings, GameEngine.newGame(randomSeed()), false, true) }, 'Nytt spel'),
    h('button', { class: 'btn big', 'data-testid': 'title-import', onclick: () => importFlow(settings) }, 'Importera sparfil'),
    !saves ? h('p', { class: 'warn' }, 'Lokal lagring är avstängd i den här webbläsaren – spelet kan inte sparas.') : null,
    h('p', { class: 'version' }, `Version ${APP_VERSION} (${__BUILD_ID__}) · sparformat ${SCHEMA_VERSION}`),
  );
  mount.replaceChildren(screen);
}

function startGame(settings: Settings, engine: GameEngine, recovered: boolean, fresh = false): void {
  engine.invariantEvery = 600;
  const repairs = fresh ? [] : reconcile(engine.world);
  if (!fresh) engine.state.clock.paused = true; // a loaded game always resumes paused
  app = new GameApp(engine, saves, settings);
  ui = new UI(app, mount);
  ui.panels.shell = {
    appVersion: APP_VERSION,
    newCampaign: () => void newCampaign(),
    importSave: () => void importFlow(settings),
    exportSave: () => void exportSave(),
    saveNow: () => void app!.save('manual').then((ok) => ui!.toast(ok ? 'Sparat' : 'Kunde inte spara', ok ? 'good' : 'bad')),
    diagnostics,
  };
  const host = h('div', { class: 'canvas-host' });
  ui.stage.prepend(host);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    pixelArt: true,
    backgroundColor: '#2c4a2b',
    scale: { mode: Phaser.Scale.RESIZE, width: host.clientWidth || 390, height: host.clientHeight || 600 },
    fps: { target: settings.graphics === 'low' ? 30 : 60 },
    audio: { noAudio: true },
    banner: false,
    input: { mouse: false, touch: false, keyboard: false },
    scene: [],
  });
  game.scene.add('hospital', HospitalScene, true, { app });
  new InputController(host, app);
  if (recovered) ui.toast('Den senaste sparningen var skadad – en tidigare version laddades.', 'warn');
  if (repairs.length) noteError(`Avstämning efter laddning: ${repairs.join('; ')}`);
  if (fresh) void app.save('start');
  (window as unknown as { pixelHospital: unknown }).pixelHospital = { app, game, diagnostics };
}

async function newCampaign(): Promise<void> {
  if (!app) return;
  await app.save('before-new');
  const engine = GameEngine.newGame(randomSeed());
  engine.invariantEvery = 600;
  app.replaceEngine(engine);
  app.whenSceneReady(() => app!.scene!.centerOn(31, 56, app!.defaultZoom()));
  await app.save('new');
  ui?.closeSheet();
  ui?.toast('Ny kampanj startad!', 'good');
}

async function exportSave(): Promise<void> {
  if (!app || !saves) return;
  await app.save('export');
  const json = await saves.exportJSON(app.engine.state);
  const s = app.engine.state;
  const name = `pixel-hospital-kap${s.progress.chapter}-dag${Math.floor(s.clock.tick / DEF.sim.ticksPerDay) + 1}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  ui?.toast(`Sparfilen ${name} skapades – spara den i Filer.`, 'good');
}

function importFlow(settings: Settings): void {
  if (!saves) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Filen är för stor');
      const preview = await saves!.previewImport(await file.text());
      const s = preview.state;
      const show = (title: string, body: Node[], actions: [string, () => void][]) => {
        if (ui) ui.modal(title, body, actions);
        else {
          const box = h('div', { class: 'modal-overlay' }, h('div', { class: 'modal' }, h('h2', null, title), ...body, h('div', { class: 'btn-row' }, actions.map(([l, fn]) => h('button', { class: 'btn primary', onclick: () => { box.remove(); fn(); } }, l)))));
          document.body.append(box);
        }
      };
      show('Importera sparfil?', [
        h('p', null, h('b', null, s.campaign.name)),
        h('p', null, `Dag ${Math.floor(s.clock.tick / DEF.sim.ticksPerDay) + 1} · kapitel ${s.progress.chapter} · ${kr(s.economy.cash)} · sparad ${preview.envelope.savedAt.slice(0, 16).replace('T', ' ')}`),
        preview.migratedFrom !== null ? h('p', { class: 'muted' }, `Uppgraderas från sparformat ${preview.migratedFrom}.`) : null,
        h('p', { class: 'muted' }, 'Din nuvarande kampanj behålls som säkerhetskopia.'),
      ].filter((x): x is HTMLParagraphElement => !!x), [
        ['Importera', async () => {
          if (app) await app.save('before-import');
          const r = await saves!.commitImport(preview);
          if (!r.ok) throw new Error(r.error);
          const loaded = await saves!.load(preview.state.campaign.id);
          const engine = new GameEngine(loaded.state);
          if (app) {
            engine.invariantEvery = 600;
            reconcile(engine.world);
            engine.state.clock.paused = true;
            app.replaceEngine(engine);
            ui?.toast('Sparfilen är importerad. Spelet är pausat.', 'good');
          } else startGame(settings, engine, false);
        }],
        ['Avbryt', () => undefined],
      ]);
    } catch (err) {
      const msg = `Importen misslyckades: ${(err as Error).message}`;
      noteError(msg);
      if (ui) ui.toast(msg, 'bad');
      else alert(msg);
    }
  };
  input.click();
}

function diagnostics(): string {
  const a = app;
  const s = a?.engine.state;
  const scene = a?.scene;
  const nav = a ? navStats(a.engine.world) : null;
  return [
    `Pixel Hospital ${APP_VERSION} (bygge ${__BUILD_ID__})`,
    `Sparformat ${SCHEMA_VERSION} · speldata ${GAME_DATA_VERSION}`,
    s ? `Kampanj ${s.campaign.id} (frö ${s.campaign.seed})` : 'Ingen kampanj',
    s ? `Tick ${s.clock.tick} · dag ${Math.floor(s.clock.tick / DEF.sim.ticksPerDay) + 1} · hastighet ${s.clock.speed}× ${s.clock.paused ? '(pausad)' : ''}` : '',
    `Senast sparat: ${a?.lastSaveAt ?? '–'} ${a && !a.lastSaveOk ? '(misslyckades)' : ''}`,
    s ? `Patienter ${s.patients.length} · personal ${s.staff.length} · rum ${s.rooms.length} · bokningar ${s.reservations.length}` : '',
    scene ? `Bildfrekvens (median) ${scene.averageFps().toFixed(0)} fps · simtid/tick ${(a!.engine.lastTickMs).toFixed(2)} ms` : '',
    nav ? `Vägcache ${nav.size} (träffar ${nav.hits}, sökningar ${nav.searches})` : '',
    s ? `Invariantfel: ${s.audit.violations.length}` : '',
    `Ljud: ${a?.sfx.unlocked ? 'aktiverat' : 'inte aktiverat'} · Service worker: ${navigator.serviceWorker?.controller ? 'aktiv' : 'inaktiv'}`,
    `Webbläsare: ${navigator.userAgent}`,
    `Senaste fel (${errors.length + (a?.recentErrors.length ?? 0)}):`,
    ...[...errors, ...(a?.recentErrors ?? [])].slice(-10),
  ].filter(Boolean).join('\n');
}

// Background / foreground: pause, save, stop audio. Returning never simulates elapsed real time.
document.addEventListener('visibilitychange', () => {
  if (!app) return;
  if (document.hidden) {
    if (!app.engine.state.clock.paused) app.setPaused(true);
    void app.save('background');
    app.sfx.suspend();
  } else {
    app.sfx.resume();
    ui?.refresh(true);
  }
});
window.addEventListener('pagehide', () => void app?.save('pagehide'));
// Audio may only start after a user gesture: unlock on the first tap anywhere (never autoplay).
document.addEventListener('pointerdown', () => app?.userGesture(), { capture: true });

// Service worker + safe update flow.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
      let updateRequested = false;
      const offer = (worker: ServiceWorker) => {
        const banner = h('div', { class: 'update-banner' }, h('span', null, 'En ny version av Pixel Hospital finns.'), h('button', { class: 'btn primary small', onclick: async () => {
          if (app) {
            app.setPaused(true);
            await app.save('update');
          }
          updateRequested = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        } }, 'Uppdatera'));
        document.body.append(banner);
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // First install claims the page without any reload; only a user-approved update reloads.
        if (reloading || !updateRequested) return;
        reloading = true;
        location.reload();
      });
      setInterval(() => void reg.update(), 60 * 60 * 1000);
    } catch (err) {
      noteError(`Service worker: ${(err as Error).message}`);
    }
  });
}

void boot();
