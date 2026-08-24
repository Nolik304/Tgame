// ============================================================
// WebAudio-синтезатор SFX: без внешних файлов, всё процедурно.
// Контекст создаётся по первому жесту пользователя (unlock).
// ============================================================
import { playerState } from './PlayerState';
import { vk } from './VKBridgeService';

export type SfxName =
  | 'click'
  | 'tap'
  | 'swap'
  | 'invalid'
  | 'match'
  | 'fall'
  | 'star'
  | 'win'
  | 'lose'
  | 'chest'
  | 'coin'
  | 'heart'
  | 'boost';

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  slide?: number;
  delay?: number;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Вызывать по первому касанию — разблокирует аудио. */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
  }

  private tone(freq: number, dur: number, opts: ToneOpts = {}): void {
    if (!this.ctx || !this.master) return;
    if (!playerState.data.settings.sound) return;
    const { type = 'sine', vol = 0.2, slide, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  play(name: SfxName, chain = 0): void {
    switch (name) {
      case 'click':
        this.tone(720, 0.07, { type: 'triangle', vol: 0.16 });
        break;
      case 'tap':
        this.tone(520, 0.05, { type: 'sine', vol: 0.12 });
        break;
      case 'swap':
        this.tone(300, 0.1, { slide: 540, vol: 0.16 });
        break;
      case 'invalid':
        this.tone(150, 0.18, { type: 'sawtooth', vol: 0.1, slide: 110 });
        break;
      case 'match': {
        const base = 392 * Math.pow(1.14, Math.min(chain, 8));
        this.tone(base, 0.1, { type: 'triangle', vol: 0.2 });
        this.tone(base * 1.25, 0.1, { type: 'triangle', vol: 0.18, delay: 0.05 });
        this.tone(base * 1.5, 0.14, { type: 'triangle', vol: 0.16, delay: 0.1 });
        break;
      }
      case 'fall':
        this.tone(220, 0.1, { slide: 120, vol: 0.06 });
        break;
      case 'star':
        this.tone(1318, 0.22, { type: 'triangle', vol: 0.22 });
        this.tone(1975, 0.3, { type: 'sine', vol: 0.12, delay: 0.04 });
        break;
      case 'win':
        [523, 659, 784, 1047, 1318].forEach((f, i) =>
          this.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.11 }),
        );
        this.tone(1568, 0.5, { vol: 0.1, delay: 0.55 });
        break;
      case 'lose':
        [330, 262, 208, 165].forEach((f, i) =>
          this.tone(f, 0.24, { type: 'sawtooth', vol: 0.09, delay: i * 0.14 }),
        );
        break;
      case 'chest':
        [880, 1174, 1568, 2093].forEach((f, i) =>
          this.tone(f, 0.16, { type: 'triangle', vol: 0.16, delay: i * 0.06 }),
        );
        break;
      case 'coin':
        this.tone(988, 0.08, { type: 'square', vol: 0.08 });
        this.tone(1319, 0.14, { type: 'square', vol: 0.08, delay: 0.07 });
        break;
      case 'heart':
        this.tone(660, 0.12, { slide: 880, vol: 0.16 });
        break;
      case 'boost':
        this.tone(400, 0.35, { slide: 1400, type: 'triangle', vol: 0.16 });
        break;
    }
  }

  vibrate(style: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!playerState.data.settings.vibration) return;
    vk.taptic(style);
  }
}

export const sfx = new SoundManager();
