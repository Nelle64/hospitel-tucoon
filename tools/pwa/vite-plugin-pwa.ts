import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Minimal, dependency-free PWA plugin: writes dist/sw.js with a full precache list and a content hash version. */
export function pwaPlugin(opts: { base: string; version: string }): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'pixel-hospital-pwa',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && f !== 'precache-manifest.json')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const cacheVersion = `${opts.version}-${hash.digest('hex').slice(0, 12)}`;
      const precache = ['', ...files];
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      const sw = template
        .split('__CACHE_VERSION__').join(cacheVersion)
        .split('__BASE__').join(opts.base)
        .split('__PRECACHE_LIST__').join(JSON.stringify(precache, null, 0));
      if (/__[A-Z_]+__/.test(sw)) throw new Error('sw.js still contains an unreplaced placeholder');
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'precache-manifest.json'), JSON.stringify({ cacheVersion, files: precache }, null, 2));
    },
  };
}
