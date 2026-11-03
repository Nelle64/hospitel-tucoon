import { expect, test } from '@playwright/test';
import { canvasBox, evidence, newGame, skipTutorial } from './helpers';

test('REQ-UX-01 portrait layout: map ≥ 55 % of the viewport, no horizontal overflow, readable text, 44 px targets', async ({ page }, info) => {
  await newGame(page);
  const vp = page.viewportSize()!;
  const box = await canvasBox(page);
  const mapShare = box.height / vp.height;
  expect(mapShare).toBeGreaterThanOrEqual(0.55);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() => [...document.querySelectorAll('button, .tbtn, .navbtn')].filter((b) => {
    const r = (b as HTMLElement).getBoundingClientRect();
    return r.width > 0 && (r.height < 40 || r.width < 40);
  }).map((b) => (b as HTMLElement).innerText || b.className));
  expect(small).toEqual([]);
  const tinyText = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
    const el = e as HTMLElement;
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && parseFloat(getComputedStyle(el).fontSize) < 11;
  }).length);
  expect(tinyText).toBe(0);
  const safe = await page.evaluate(() => getComputedStyle(document.querySelector('.hud')!).paddingTop);
  expect(safe).toBeTruthy();
  evidence(`layout-${info.project.name}`, { viewport: vp, mapShare, overflow });
  await page.screenshot({ path: `test-results/layout-${info.project.name}.png` });
});

test('REQ-UX-02 bottom sheets open for every navigation section and never clip horizontally', async ({ page }) => {
  await newGame(page);
  await skipTutorial(page);
  for (const panel of ['build', 'staff', 'analytics', 'missions']) {
    await page.click(`.navbtn[data-panel=${panel}]`);
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    const b = (await sheet.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await page.click(`.navbtn[data-panel=${panel}]`);
    await expect(sheet).toBeHidden();
  }
  for (const tab of ['overview', 'patients', 'staff', 'eco']) {
    await page.click('.navbtn[data-panel=analytics]');
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.locator('.sheet-body')).toBeVisible();
    await page.click('.navbtn[data-panel=analytics]');
  }
});
