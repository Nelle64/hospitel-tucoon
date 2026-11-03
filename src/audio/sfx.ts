/** WebAudio sound effects: no autoplay, unlocked by the first user gesture, max 8 voices with priorities. */
export interface AudioSettings {
  volume: number;
  muted: boolean;
  ambient: boolean;
}

interface Voice {
  src: AudioBufferSourceNode;
  priority: number;
  name: string;
  started: number;
}

const MAX_VOICES = 8;

export class Sfx {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private meta = new Map<string, { priority: number; category: string }>();
  private voices: Voice[] = [];
  private lastPlay = new Map<string, number>();
  unlocked = false;
  playedLog: string[] = [];

  constructor(private settings: AudioSettings, private base: string) {}

  /** Must be called from a user gesture (tap). */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctor = (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    this.applySettings(this.settings);
    this.unlocked = true;
    try {
      await this.ctx.resume();
      const res = await fetch(`${this.base}assets/manifest.json`);
      const manifest = (await res.json()) as { audio: { name: string; file: string; priority: number; category: string }[] };
      await Promise.all(
        manifest.audio.map(async (a) => {
          const r = await fetch(`${this.base}assets/${a.file}`);
          const buf = await this.ctx!.decodeAudioData(await r.arrayBuffer());
          this.buffers.set(a.name, buf);
          this.meta.set(a.name, { priority: a.priority, category: a.category });
        }),
      );
    } catch {
      // Audio is optional – the game is fully playable without sound.
    }
  }

  applySettings(s: AudioSettings): void {
    this.settings = s;
    if (this.gain) this.gain.gain.value = s.muted ? 0 : Math.max(0, Math.min(1, s.volume));
  }

  play(name: string): void {
    if (!this.ctx || !this.gain || this.settings.muted || this.ctx.state !== 'running') return;
    const buf = this.buffers.get(name);
    const meta = this.meta.get(name);
    if (!buf || !meta) return;
    if (meta.category === 'ambient' && !this.settings.ambient) return;
    const now = this.ctx.currentTime;
    // De-duplicate bursts of the same sound (e.g. many completions in one tick).
    if (now - (this.lastPlay.get(name) ?? -1) < 0.08) return;
    this.voices = this.voices.filter((v) => v.started + (v.src.buffer?.duration ?? 0) > now);
    if (this.voices.length >= MAX_VOICES) {
      const lowest = this.voices.reduce((a, b) => (b.priority < a.priority ? b : a));
      if (lowest.priority > meta.priority) return;
      lowest.src.stop();
      this.voices.splice(this.voices.indexOf(lowest), 1);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start();
    this.voices.push({ src, priority: meta.priority, name, started: now });
    this.lastPlay.set(name, now);
    this.playedLog.push(name);
    if (this.playedLog.length > 50) this.playedLog.shift();
  }

  get activeVoices(): number {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    return this.voices.filter((v) => v.started + (v.src.buffer?.duration ?? 0) > now).length;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
}
