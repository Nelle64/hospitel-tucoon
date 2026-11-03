/** Original synthesized retro sound effects (deterministic), written as 16-bit mono WAV. */
const RATE = 22050;

type Wave = 'square' | 'triangle' | 'sine' | 'saw' | 'noise';

function osc(wave: Wave, phase: number, noise: () => number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'square': return p < 0.5 ? 1 : -1;
    case 'triangle': return 1 - 4 * Math.abs(p - 0.5);
    case 'saw': return 2 * p - 1;
    case 'sine': return Math.sin(2 * Math.PI * p);
    case 'noise': return noise() * 2 - 1;
  }
}

interface Note {
  t: number;
  dur: number;
  f0: number;
  f1?: number;
  wave: Wave;
  vol: number;
  attack?: number;
  release?: number;
  vibrato?: number;
}

function render(notes: Note[], length: number, seed = 1): Float32Array {
  const n = Math.ceil(length * RATE);
  const out = new Float32Array(n);
  let s = seed;
  const noise = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (const note of notes) {
    const start = Math.floor(note.t * RATE);
    const len = Math.floor(note.dur * RATE);
    let phase = 0;
    const a = (note.attack ?? 0.005) * RATE;
    const r = (note.release ?? 0.05) * RATE;
    for (let i = 0; i < len && start + i < n; i++) {
      const k = i / len;
      const f = note.f0 + ((note.f1 ?? note.f0) - note.f0) * k + (note.vibrato ? Math.sin(i / RATE * 2 * Math.PI * 7) * note.vibrato : 0);
      phase += f / RATE;
      const env = Math.min(1, i / Math.max(1, a)) * Math.min(1, (len - i) / Math.max(1, r));
      out[start + i]! += osc(note.wave, phase, noise) * note.vol * env;
    }
  }
  return out;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const N = (n: number) => 440 * 2 ** ((n - 69) / 12);

export const SOUNDS: Record<string, { usage: string; build: () => Float32Array; priority: number; category: 'ui' | 'feedback' | 'warning' | 'ambient' | 'disease' }> = {
  ui_click: { usage: 'button tap', priority: 1, category: 'ui', build: () => render([{ t: 0, dur: 0.04, f0: 1200, f1: 900, wave: 'square', vol: 0.18 }], 0.06) },
  build_ok: { usage: 'room built', priority: 4, category: 'feedback', build: () => render([0, 4, 7, 12].map((s, i) => ({ t: i * 0.07, dur: 0.12, f0: N(72 + s), wave: 'square' as Wave, vol: 0.18 }) as Note).concat([{ t: 0, dur: 0.25, f0: 120, f1: 60, wave: 'noise', vol: 0.12 }]), 0.45) },
  build_fail: { usage: 'invalid construction', priority: 3, category: 'feedback', build: () => render([{ t: 0, dur: 0.12, f0: 220, wave: 'square', vol: 0.2 }, { t: 0.13, dur: 0.18, f0: 165, wave: 'square', vol: 0.2 }], 0.35) },
  upgrade: { usage: 'room upgraded', priority: 4, category: 'feedback', build: () => render([{ t: 0, dur: 0.35, f0: 300, f1: 900, wave: 'triangle', vol: 0.25 }, { t: 0.3, dur: 0.15, f0: N(84), wave: 'square', vol: 0.12 }], 0.5) },
  treat_done: { usage: 'patient discharged successfully', priority: 2, category: 'feedback', build: () => render([{ t: 0, dur: 0.08, f0: N(79), wave: 'triangle', vol: 0.22 }, { t: 0.08, dur: 0.14, f0: N(84), wave: 'triangle', vol: 0.22 }], 0.25) },
  cash: { usage: 'money received', priority: 2, category: 'feedback', build: () => render([{ t: 0, dur: 0.05, f0: N(88), wave: 'square', vol: 0.12 }, { t: 0.05, dur: 0.12, f0: N(93), wave: 'square', vol: 0.12 }], 0.2) },
  research: { usage: 'research discovery / disease identified', priority: 5, category: 'feedback', build: () => render([0, 3, 7, 10, 14].map((s, i) => ({ t: i * 0.06, dur: 0.2, f0: N(76 + s), wave: 'sine' as const, vol: 0.2, vibrato: 4 })), 0.6) },
  mission: { usage: 'mission completed', priority: 5, category: 'feedback', build: () => render([{ t: 0, dur: 0.1, f0: N(72), wave: 'square', vol: 0.16 }, { t: 0.1, dur: 0.1, f0: N(76), wave: 'square', vol: 0.16 }, { t: 0.2, dur: 0.1, f0: N(79), wave: 'square', vol: 0.16 }, { t: 0.3, dur: 0.3, f0: N(84), wave: 'square', vol: 0.18 }], 0.7) },
  milestone: { usage: 'chapter completed / campaign milestone', priority: 6, category: 'feedback', build: () => render([[0, 60], [0.15, 64], [0.3, 67], [0.45, 72], [0.6, 76], [0.75, 79]].flatMap(([t, n]) => [{ t: t!, dur: 0.3, f0: N(n!), wave: 'square' as const, vol: 0.12 }, { t: t!, dur: 0.3, f0: N(n! - 12), wave: 'triangle' as const, vol: 0.15 }]), 1.2) },
  victory: { usage: 'Det gyllene stetoskopet', priority: 7, category: 'feedback', build: () => render([60, 64, 67, 72, 67, 72, 76, 79, 84].map((n, i) => ({ t: i * 0.14, dur: i === 8 ? 0.8 : 0.16, f0: N(n), wave: 'square' as Wave, vol: 0.14 }) as Note).concat([{ t: 1.12, dur: 0.8, f0: N(60), wave: 'triangle', vol: 0.2 }]), 2.0) },
  econ_warn: { usage: 'economic warning', priority: 6, category: 'warning', build: () => render([{ t: 0, dur: 0.18, f0: N(64), wave: 'triangle', vol: 0.25 }, { t: 0.22, dur: 0.3, f0: N(59), wave: 'triangle', vol: 0.25 }], 0.6) },
  emergency: { usage: 'emergency / critical patient', priority: 7, category: 'warning', build: () => render([0, 0.3, 0.6].flatMap((t) => [{ t, dur: 0.14, f0: 880, wave: 'square' as const, vol: 0.16 }, { t: t + 0.15, dur: 0.14, f0: 660, wave: 'square' as const, vol: 0.16 }]), 0.95) },
  monitor_beep: { usage: 'medical monitor (ambient)', priority: 0, category: 'ambient', build: () => render([{ t: 0, dur: 0.07, f0: 1046, wave: 'sine', vol: 0.12 }], 0.1) },
  xray_hum: { usage: 'x-ray machine (ambient)', priority: 0, category: 'ambient', build: () => render([{ t: 0, dur: 0.6, f0: 110, f1: 140, wave: 'saw', vol: 0.06, attack: 0.1, release: 0.2 }, { t: 0, dur: 0.6, f0: 2000, wave: 'noise', vol: 0.02, attack: 0.1, release: 0.3 }], 0.65) },
  door: { usage: 'door swish (ambient)', priority: 0, category: 'ambient', build: () => render([{ t: 0, dur: 0.15, f0: 400, f1: 200, wave: 'noise', vol: 0.06 }], 0.18) },
  teleport: { usage: 'Teleportationshicka', priority: 2, category: 'disease', build: () => render([{ t: 0, dur: 0.2, f0: 200, f1: 2000, wave: 'square', vol: 0.1 }, { t: 0.05, dur: 0.15, f0: 3000, wave: 'noise', vol: 0.05 }], 0.25) },
  hiccup: { usage: 'hiccup / absurd disease', priority: 2, category: 'disease', build: () => render([{ t: 0, dur: 0.06, f0: 600, f1: 1400, wave: 'triangle', vol: 0.2 }], 0.1) },
  glitch: { usage: 'Digital feber', priority: 2, category: 'disease', build: () => render([0, 0.04, 0.09, 0.13].map((t, i) => ({ t, dur: 0.03, f0: [1800, 300, 2400, 600][i]!, wave: 'square' as const, vol: 0.1 })), 0.2) },
  sneeze: { usage: 'Förkylning sneeze', priority: 1, category: 'disease', build: () => render([{ t: 0, dur: 0.1, f0: 500, f1: 900, wave: 'triangle', vol: 0.08 }, { t: 0.12, dur: 0.15, f0: 4000, wave: 'noise', vol: 0.12 }], 0.3) },
};

export function generateAudio(): { name: string; data: Buffer; usage: string; priority: number; category: string; seconds: number }[] {
  return Object.entries(SOUNDS).map(([name, s]) => {
    const samples = s.build();
    return { name, data: wav(samples), usage: s.usage, priority: s.priority, category: s.category, seconds: Math.round((samples.length / RATE) * 1000) / 1000 };
  });
}
