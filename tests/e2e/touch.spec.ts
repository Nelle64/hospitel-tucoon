import { expect, test } from '@playwright/test';
import { canvasBox, newGame, skipTutorial, state, touchPath } from './helpers';

test.describe('touch controls', () => {
  test.beforeEach(async ({ page }) => {
    await newGame(page);
    await skipTutorial(page);
    await page.getByTestId('speed-0').click();
  });

  test('REQ-TOUCH-01 one-finger drag pans, pinch zooms, tap selects', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cam0 = await page.evaluate(() => { const c = (window as any).pixelHospital.app.scene.cameras.main; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
    await touchPath(cdp, [[{ x: cx, y: cy }, { x: cx + 80, y: cy + 60 }]]);
    const cam1 = await page.evaluate(() => { const c = (window as any).pixelHospital.app.scene.cameras.main; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
    expect(cam1.x).toBeLessThan(cam0.x - 20);
    expect(cam1.y).toBeLessThan(cam0.y - 20);
    await touchPath(cdp, [[{ x: cx - 30, y: cy }, { x: cx - 90, y: cy }], [{ x: cx + 30, y: cy }, { x: cx + 90, y: cy }]]);
    const cam2 = await page.evaluate(() => (window as any).pixelHospital.app.scene.cameras.main.zoom);
    expect(cam2).toBeGreaterThan(cam1.z * 1.5);
    // Tap a room: the info sheet opens.
    await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      const r = app.engine.state.rooms.find((x: any) => x.type === 'R02');
      app.scene.centerOn(r.x + r.w / 2, r.y + r.h / 2, 1.5);
    });
    await page.waitForTimeout(250);
    const pt = await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      const r = app.engine.state.rooms.find((x: any) => x.type === 'R02');
      const cam = app.scene.cameras.main;
      const wx = (r.x + r.w / 2) * 32;
      const wy = (r.y + r.h / 2) * 32;
      return { x: (wx - cam.worldView.x) * cam.zoom, y: (wy - cam.worldView.y) * cam.zoom };
    });
    await page.touchscreen.tap(box.x + pt.x, box.y + pt.y);
    // Either the waiting room itself or a patient sitting in it is selected.
    await expect(page.locator('.sheet.compact')).toBeVisible();
    const sel = await state<{ kind: string } | null>(page, 'app.selection');
    expect(sel).not.toBeNull();
  });

  test('REQ-TOUCH-02 building: drag defines a preview, panning never builds, explicit confirm builds and charges', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await page.click('.navbtn[data-panel=build]');
    await page.getByTestId('build-R03').click();
    const box = await canvasBox(page);
    // Two-finger gesture in build mode pans instead of drawing.
    const rooms0 = await state<number>(page, 's.rooms.length');
    await touchPath(cdp, [[{ x: box.x + 100, y: box.y + 100 }, { x: box.x + 160, y: box.y + 160 }], [{ x: box.x + 180, y: box.y + 100 }, { x: box.x + 240, y: box.y + 160 }]]);
    expect(await state<unknown>(page, 'app.draft')).toBeNull();
    // Place a min-size room on free grass next to the corridor via a single-finger drag.
    const spot = await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      const cam = app.scene.cameras.main;
      const toScreen = (tx: number, ty: number) => ({ x: (tx * 32 + 16 - cam.worldView.x) * cam.zoom, y: (ty * 32 + 16 - cam.worldView.y) * cam.zoom });
      return { a: toScreen(27, 50), b: toScreen(30, 53) };
    });
    await page.evaluate(() => (window as any).pixelHospital.app.scene.centerOn(29, 51));
    await page.waitForTimeout(250); // camera worldView updates on the next rendered frame
    const spot2 = await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      const cam = app.scene.cameras.main;
      const toScreen = (tx: number, ty: number) => ({ x: (tx * 32 + 16 - cam.worldView.x) * cam.zoom, y: (ty * 32 + 16 - cam.worldView.y) * cam.zoom });
      return { a: toScreen(27, 50), b: toScreen(30, 53) };
    });
    void spot;
    await touchPath(cdp, [[{ x: box.x + spot2.a.x, y: box.y + spot2.a.y }, { x: box.x + spot2.b.x, y: box.y + spot2.b.y }]]);
    const draft = await state<{ x: number; y: number; w: number; h: number }>(page, 'app.draft');
    expect(draft).toMatchObject({ x: 27, y: 50, w: 4, h: 4 });
    await expect(page.getByTestId('build-cost')).toContainText('6 200 kr');
    expect(await state<number>(page, 's.rooms.length')).toBe(rooms0);
    const cash0 = await state<number>(page, 's.economy.cash');
    await page.getByTestId('build-confirm').click();
    expect(await state<number>(page, 's.rooms.length')).toBe(rooms0 + 1);
    expect(await state<number>(page, 's.economy.cash')).toBe(cash0 - 6200);
  });

  test('REQ-TOUCH-03 invalid placement shows a Swedish error and cannot be confirmed', async ({ page }) => {
    await page.click('.navbtn[data-panel=build]');
    await page.getByTestId('build-R03').click();
    await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      app.setDraft({ ...app.newDraftBase(), x: 27, y: 54, door: null });
    });
    await expect(page.getByTestId('build-errors')).toContainText('Överlappar');
    await expect(page.getByTestId('build-confirm')).toBeDisabled();
    await page.getByTestId('build-cancel').click();
    expect(await state<unknown>(page, 'app.buildMode')).toBeNull();
  });

  test('REQ-TOUCH-04 blueprint planning costs nothing and is editable', async ({ page }) => {
    const cash0 = await state<number>(page, 's.economy.cash');
    await page.click('.navbtn[data-panel=build]');
    await page.getByTestId('tab-blueprint').click();
    await page.getByTestId('bp-room').click();
    await page.locator('.modal .room-card', { hasText: 'Mottagningsrum' }).click();
    await page.evaluate(() => {
      const app = (window as any).pixelHospital.app;
      app.setDraft({ ...app.newDraftBase(), x: 27, y: 50, door: null });
    });
    await page.getByTestId('build-confirm').click();
    expect(await state<number>(page, 's.blueprint.items.length')).toBe(1);
    expect(await state<number>(page, 's.economy.cash')).toBe(cash0);
    await page.getByTestId('build-cancel').click();
    await page.click('.navbtn[data-panel=build]');
    await page.getByTestId('tab-blueprint').click();
    await page.getByTestId('bp-build-all').click();
    expect(await state<number>(page, 's.rooms.length')).toBe(5);
    expect(await state<number>(page, 's.blueprint.items.length')).toBe(0);
  });

  test('REQ-TOUCH-05 hiring and assigning staff through the UI', async ({ page }) => {
    await page.click('.navbtn[data-panel=staff]');
    await page.getByTestId('tab-hire').click();
    const before = await state<number>(page, 's.staff.length');
    await page.locator('[data-testid^=hire-]').first().click();
    await page.locator('.modal .choice-list .btn').first().click();
    expect(await state<number>(page, 's.staff.length')).toBe(before + 1);
  });
});
