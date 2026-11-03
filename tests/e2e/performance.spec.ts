import { test, expect, type Page } from '@playwright/test';
import { fixture } from './fixtures';
import { evidence } from './helpers';

async function measure(page: Page, seconds: number): Promise<{ medianFps: number; p95ms: number; frames: number }> {
  return page.evaluate(async (sec) => {
    const times: number[] = [];
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const end = last + sec * 1000;
      const f = (t: number) => {
        times.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(f);
        else resolve();
      };
      requestAnimationFrame(f);
    });
    times.shift();
    const sorted = times.slice().sort((a, b) => a - b);
    return { medianFps: 1000 / sorted[Math.floor(sorted.length / 2)]!, p95ms: sorted[Math.floor(sorted.length * 0.95)]!, frames: times.length };
  }, seconds);
}

const scenarios = [
  { name: 'small: ~8 rooms, ~15 agents', kind: 'small' as const, zoom: 1.0, target: { fps: 50 } },
  { name: 'medium: ~20 rooms, ~60 agents', kind: 'mid' as const, zoom: 0.8, target: { fps: 45 } },
  { name: 'large: ~40 rooms, ~120 agents', kind: 'large' as const, zoom: 0.6, target: { fps: 30, p95: 50 } },
];

test.describe('performance (desktop headless Chromium – NOT a physical iPhone measurement)', () => {
  test.skip(({ viewport }) => viewport!.width !== 390, 'runs once');
  const results: unknown[] = [];
  for (const sc of scenarios) {
    test(`PERF ${sc.name}`, async ({ page, browserName }) => {
      const path = await fixture(sc.kind);
      await page.goto('./');
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('title-import').click();
      await (await chooser).setFiles(path);
      await page.locator('.modal .btn', { hasText: 'Importera' }).click();
      await page.waitForFunction(() => !!(window as any).pixelHospital?.app.scene);
      await page.evaluate((z) => {
        const app = (window as any).pixelHospital.app;
        app.dispatch({ type: 'TUTORIAL', action: 'skip' }, true);
        const rooms = app.engine.state.rooms;
        const cx = rooms.reduce((s: number, r: any) => s + r.x + r.w / 2, 0) / rooms.length;
        const cy = rooms.reduce((s: number, r: any) => s + r.y + r.h / 2, 0) / rooms.length;
        app.scene.centerOn(cx, cy, z);
        app.dispatch({ type: 'SET_SPEED', speed: 2 }, true);
      }, sc.zoom);
      await page.waitForTimeout(3000);
      const counts = await page.evaluate(() => {
        const app = (window as any).pixelHospital.app;
        const s = app.engine.state;
        const view = app.scene.cameras.main.worldView;
        let visible = 0;
        for (const child of app.scene.children.list) if (child.type === 'Sprite' && child.visible && view.contains(child.x, child.y)) visible++;
        return { rooms: s.rooms.length, patients: s.patients.length, staffOnSite: s.staff.filter((x: any) => x.onSite).length, visibleAgents: visible, simMsPerTick: app.engine.lastTickMs };
      });
      const m = await measure(page, 8);
      const env = await page.evaluate(() => ({ ua: navigator.userAgent, hw: navigator.hardwareConcurrency, renderer: (() => { const c = document.createElement('canvas').getContext('webgl'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return d ? c!.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() }));
      const r = { scenario: sc.name, ...counts, ...m, target: sc.target, meetsTarget: m.medianFps >= sc.target.fps && (!sc.target.p95 || m.p95ms < sc.target.p95), browser: browserName, env };
      results.push(r);
      evidence(`performance-${sc.kind}`, r);
      expect(m.frames).toBeGreaterThan(20);
    });
  }
});
