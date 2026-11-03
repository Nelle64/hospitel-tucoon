import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fixture } from './fixtures';
import { newGame, skipTutorial, state } from './helpers';

const OUT = 'docs/images/screenshots';

async function importFixture(page: Page, kind: Parameters<typeof fixture>[0]): Promise<void> {
  const path = await fixture(kind);
  await page.goto('./');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('title-import').click();
  await (await chooser).setFiles(path);
  await page.locator('.modal .btn', { hasText: 'Importera' }).click();
  await page.waitForFunction(() => !!(window as any).pixelHospital?.app.scene);
  await page.evaluate(() => (window as any).pixelHospital.app.dispatch({ type: 'TUTORIAL', action: 'skip' }, true));
}

async function centerOnHospital(page: Page, zoom: number): Promise<void> {
  await page.evaluate((z) => {
    const app = (window as any).pixelHospital.app;
    const rooms = app.engine.state.rooms;
    const cx = rooms.reduce((s: number, r: any) => s + r.x + r.w / 2, 0) / rooms.length;
    const cy = rooms.reduce((s: number, r: any) => s + r.y + r.h / 2, 0) / rooms.length;
    app.scene.centerOn(cx, cy, z);
  }, zoom);
}

test.describe('visual QA screenshots (actual running game)', () => {
  test.skip(({ viewport }) => viewport!.width !== 390, 'screenshots at 390×844');
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  test('VIS-1 initial clinic', async ({ page }) => {
    await newGame(page);
    await skipTutorial(page);
    await page.getByTestId('speed-2').click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/1-initial-clinic.png` });
  });

  test('VIS-2 construction preview', async ({ page }) => {
    await newGame(page);
    await skipTutorial(page);
    await page.getByTestId('speed-0').click();
    await page.click('.navbtn[data-panel=build]');
    await page.getByTestId('build-R05').click();
    await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      app.setDraft({ ...app.newDraftBase(), x: 27, y: 50, w: 4, h: 4, door: null });
      app.scene.centerOn(29, 53);
    });
    await expect(page.getByTestId('build-confirm')).toBeEnabled();
    await page.screenshot({ path: `${OUT}/2-construction-preview.png` });
  });

  test('VIS-3 large populated hospital', async ({ page }) => {
    await importFixture(page, 'large');
    await page.getByTestId('speed-1').click();
    await centerOnHospital(page, 0.75);
    await page.waitForTimeout(3000);
    expect(await state<number>(page, 's.patients.length')).toBeGreaterThan(60);
    await page.screenshot({ path: `${OUT}/3-large-hospital.png` });
  });

  test('VIS-4 blueprint mode', async ({ page }) => {
    await importFixture(page, 'mid');
    await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      const land = app.engine.state.progress.landStage;
      void land;
      app.dispatch({ type: 'ADD_BLUEPRINT', kind: 'corridor', x: 20, y: 40, w: 24, h: 2 }, true);
      app.dispatch({ type: 'ADD_BLUEPRINT', kind: 'room', roomType: 'R05', x: 21, y: 42, w: 4, h: 4 }, true);
      app.dispatch({ type: 'ADD_BLUEPRINT', kind: 'room', roomType: 'R13', x: 26, y: 42, w: 6, h: 6 }, true);
      app.startBuild('room', 'R03', true);
      app.setDraft({ ...app.newDraftBase(), x: 34, y: 42, w: 4, h: 4, door: null });
      app.scene.centerOn(29, 45, 0.9);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/4-blueprint-mode.png` });
  });

  test('VIS-5 staff panel', async ({ page }) => {
    await importFixture(page, 'mid');
    await page.click('.navbtn[data-panel=staff]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/5-staff-panel.png` });
  });

  test('VIS-6 analytics dashboard', async ({ page }) => {
    await importFixture(page, 'mid');
    await page.click('.navbtn[data-panel=analytics]');
    await page.getByTestId('range-30').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/6-analytics-dashboard.png` });
    await page.getByTestId('tab-eco').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/6b-analytics-economy.png` });
  });

  test('VIS-7 research screen', async ({ page }) => {
    await importFixture(page, 'mid');
    await page.click('.navbtn[data-panel=missions]');
    await page.getByTestId('tab-research').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/7-research.png` });
  });

  test('VIS-8 campaign victory (reached by playing the final inspection day)', async ({ page }) => {
    test.setTimeout(300_000);
    await importFixture(page, 'preVictory');
    expect(await state<number>(page, 's.progress.inspection.days.length')).toBe(6);
    await page.getByTestId('speed-4').click();
    for (let i = 0; i < 240; i++) {
      const done = await page.evaluate(() => { const p = (window as any).pixelHospital.app.engine.state.progress; return !!p.victory || p.inspection?.lastResult === 'failed'; });
      if (done) break;
      // Answer special-event pop-ups with their default (last) option, as the engine would.
      const ev = page.locator('.modal-overlay.event .btn');
      if (await ev.count()) await ev.last().click();
      await page.waitForTimeout(1000);
    }
    const won = await state<boolean>(page, '!!s.progress.victory');
    expect(won).toBe(true);
    await expect(page.locator('.modal h2')).toHaveText('Det gyllene stetoskopet!');
    await page.screenshot({ path: `${OUT}/8-campaign-victory.png` });
  });
});
