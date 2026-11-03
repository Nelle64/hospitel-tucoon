import { mkdirSync, writeFileSync } from 'node:fs';
import type { CDPSession, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function newGame(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('cash')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { pixelHospital?: { app: { scene: unknown } } }).pixelHospital?.app.scene);
  expect(errors).toEqual([]);
}

export async function state<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.pixelHospital.app.engine.state; const app = window.pixelHospital.app; return (${fn}); })()`) as Promise<T>;
}

export async function skipTutorial(page: Page): Promise<void> {
  const btn = page.getByTestId('tutorial-skip');
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

export async function canvasBox(page: Page) {
  const box = await page.locator('.canvas-host').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

/** Multi-touch via CDP so the app receives real pointer events from touch input. */
export async function touchPath(cdp: CDPSession, tracks: { x: number; y: number }[][], steps = 10): Promise<void> {
  const at = (i: number) => tracks.map((t, id) => {
    const a = t[0]!;
    const b = t[t.length - 1]!;
    const k = i / steps;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, id };
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export function evidence(name: string, data: unknown): void {
  mkdirSync('reports/e2e', { recursive: true });
  writeFileSync(`reports/e2e/${name}.json`, JSON.stringify(data, null, 2));
}
