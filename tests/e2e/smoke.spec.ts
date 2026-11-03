import { expect, test } from '@playwright/test';
import { newGame, state } from './helpers';

test('@smoke production build loads, starts a campaign and simulates', async ({ page }) => {
  const console: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') console.push(m.text());
  });
  await newGame(page);
  await expect(page.getByTestId('cash')).toContainText('kr');
  await expect(page.locator('.canvas-host canvas')).toBeVisible();
  const t0 = await state<number>(page, 's.clock.tick');
  await page.getByTestId('speed-4').click();
  await page.waitForTimeout(2500);
  const t1 = await state<number>(page, 's.clock.tick');
  expect(t1).toBeGreaterThan(t0 + 40);
  expect(await state<number>(page, 's.rooms.length')).toBe(4);
  expect(await state<number>(page, 's.staff.length')).toBe(3);
  expect(console.filter((c) => !c.includes('GL Driver'))).toEqual([]);
});

test('@smoke manifest, icons and service worker are served under the project base path', async ({ request }) => {
  const m = await request.get('manifest.webmanifest');
  expect(m.ok()).toBe(true);
  const manifest = await m.json();
  expect(manifest.start_url).toBe('./');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  const sw = await request.get('sw.js');
  expect(sw.ok()).toBe(true);
  const swText = await sw.text();
  expect(swText).toContain("BASE = '/hospitel-tucoon/'");
  expect(swText).not.toMatch(/__[A-Z_]+__/);
  expect(swText).toMatch(/const PRECACHE = \[/);
  const pre = await (await request.get('precache-manifest.json')).json();
  for (const f of pre.files.slice(0, 80)) expect((await request.get(f)).ok(), f).toBe(true);
});
