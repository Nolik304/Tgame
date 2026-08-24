// ============================================================
// BootScene: процедурная генерация ВСЕХ текстур (без ассетов),
// splash-экран «нажми, чтобы начать» → разблокировка WebAudio,
// инициализация VK Bridge и переход на карту.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H, GEM_KINDS, GEM_COLORS, type GemKind } from '../data/gameData';
import { sfx } from '../services/SoundManager';
import { vk } from '../services/VKBridgeService';
import { playerState } from '../services/PlayerState';

type Pt = [number, number];

const GEM_SHAPES: Record<GemKind, Pt[] | 'circle'> = {
  ruby: [[48, 6], [90, 48], [48, 90], [6, 48]],
  emerald: [[48, 6], [84, 27], [84, 69], [48, 90], [12, 69], [12, 27]],
  sapphire: [[30, 8], [66, 8], [88, 30], [88, 66], [66, 88], [30, 88], [8, 66], [8, 30]],
  topaz: [[48, 8], [90, 84], [6, 84]],
  amethyst: [[48, 4], [82, 38], [48, 92], [14, 38]],
  jade: 'circle',
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  async create(): Promise<void> {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1600)),
      ]);
    } catch {
      /* системные шрифты */
    }

    this.buildTextures();
    this.buildSplash();
  }

  // ---------------- Текстуры ----------------

  private g(): Phaser.GameObjects.Graphics {
    return this.make.graphics({}, false);
  }

  private poly(g: Phaser.GameObjects.Graphics, pts: Pt[]): void {
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
  }

  private buildTextures(): void {
    // Самоцветы
    for (const kind of GEM_KINDS) {
      const c = GEM_COLORS[kind];
      const g = this.g();
      const shape = GEM_SHAPES[kind];
      g.fillGradientStyle(c.light, c.light, c.main, c.main, 1);
      if (shape === 'circle') {
        g.fillCircle(48, 48, 40);
        g.lineStyle(5, c.dark, 1);
        g.strokeCircle(48, 48, 38);
        g.fillStyle(0xffffff, 0.25);
        g.fillEllipse(40, 32, 40, 24);
      } else {
        this.poly(g, shape);
        g.fillPath();
        g.lineStyle(5, c.dark, 1);
        this.poly(g, shape);
        g.strokePath();
        const facet = shape.map(([x, y]) => [48 + (x - 48) * 0.52, 44 + (y - 48) * 0.52] as Pt);
        g.fillStyle(0xffffff, 0.22);
        this.poly(g, facet);
        g.fillPath();
      }
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(33, 29, 5);
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(42, 22, 2.6);
      g.generateTexture(`gem_${kind}`, 96, 96);
      g.destroy();
    }

    // Искры/частицы
    let s = this.g();
    s.fillStyle(0xffffff, 1);
    s.fillCircle(8, 8, 8);
    s.fillStyle(0xffffff, 0.5);
    s.fillCircle(8, 8, 5);
    s.generateTexture('spark', 16, 16);
    s.destroy();

    // Мягкое свечение
    s = this.g();
    const glowAlphas = [0.04, 0.05, 0.06, 0.08, 0.1, 0.14];
    glowAlphas.forEach((a, i) => {
      s.fillStyle(0xfff2b0, a);
      s.fillCircle(64, 64, 62 - i * 10);
    });
    s.generateTexture('glow', 128, 128);
    s.destroy();

    // Монета
    s = this.g();
    s.fillGradientStyle(0xffe493, 0xffe493, 0xf0a51c, 0xf0a51c, 1);
    s.fillCircle(24, 24, 21);
    s.lineStyle(3.5, 0x8a5a08, 1);
    s.strokeCircle(24, 24, 19);
    s.lineStyle(2, 0x8a5a08, 0.65);
    s.strokeCircle(24, 24, 12);
    s.fillStyle(0x8a5a08, 0.9);
    s.fillCircle(24, 24, 4.5);
    s.fillStyle(0xffffff, 0.7);
    s.fillCircle(17, 16, 3.5);
    s.generateTexture('coin', 48, 48);
    s.destroy();

    // Гем (валюта)
    s = this.g();
    s.fillGradientStyle(0xb0fff4, 0xb0fff4, 0x2ab8a8, 0x2ab8a8, 1);
    this.poly(s, [[24, 2], [44, 16], [36, 44], [12, 44], [4, 16]]);
    s.fillPath();
    s.lineStyle(3, 0x0f6e63, 1);
    this.poly(s, [[24, 2], [44, 16], [36, 44], [12, 44], [4, 16]]);
    s.strokePath();
    s.fillStyle(0xffffff, 0.6);
    s.fillCircle(19, 15, 3);
    s.generateTexture('gemIcon', 48, 48);
    s.destroy();

    // Сердце (жизни)
    s = this.g();
    s.fillGradientStyle(0xff97a8, 0xff97a8, 0xe8384f, 0xe8384f, 1);
    s.fillCircle(17, 17, 11);
    s.fillCircle(31, 17, 11);
    this.poly(s, [[6.5, 21], [41.5, 21], [24, 43]]);
    s.fillPath();
    s.lineStyle(3, 0x8f0f26, 1);
    s.strokeCircle(17, 17, 10);
    s.strokeCircle(31, 17, 10);
    s.fillStyle(0xffffff, 0.65);
    s.fillCircle(15, 13, 3.5);
    s.generateTexture('heart', 48, 48);
    s.destroy();

    // Замок
    s = this.g();
    s.lineStyle(5, 0x93a29a, 1);
    s.beginPath();
    s.arc(22, 20, 10, Math.PI, 0);
    s.strokePath();
    s.fillGradientStyle(0xb9c4bd, 0xb9c4bd, 0x6e7d74, 0x6e7d74, 1);
    s.fillRoundedRect(10, 19, 24, 20, 5);
    s.lineStyle(2.5, 0x39453e, 1);
    s.strokeRoundedRect(10, 19, 24, 20, 5);
    s.fillStyle(0x2c3831, 1);
    s.fillCircle(22, 28, 3.4);
    s.fillRect(20.6, 29, 2.8, 6);
    s.generateTexture('lock', 44, 44);
    s.destroy();

    // Череп босса
    s = this.g();
    s.fillGradientStyle(0xf2ead6, 0xf2ead6, 0xb9ad87, 0xb9ad87, 1);
    s.fillCircle(28, 23, 17);
    s.fillRoundedRect(19, 34, 18, 12, 4);
    s.lineStyle(3, 0x5d5138, 1);
    s.strokeCircle(28, 23, 16);
    s.fillStyle(0x241c0e, 1);
    s.fillCircle(21, 23, 5);
    s.fillCircle(35, 23, 5);
    this.poly(s, [[28, 27], [31, 32], [25, 32]]);
    s.fillPath();
    s.fillStyle(0x5d5138, 1);
    [22, 27, 32].forEach((x) => s.fillRect(x, 38, 2.4, 7));
    s.generateTexture('skull', 56, 56);
    s.destroy();

    // Сундук
    s = this.g();
    s.fillGradientStyle(0xa8703a, 0xa8703a, 0x5d3a17, 0x5d3a17, 1);
    s.fillRoundedRect(8, 30, 56, 36, 6);
    s.fillGradientStyle(0xc98a4a, 0xc98a4a, 0x7a4c20, 0x7a4c20, 1);
    s.fillRoundedRect(8, 14, 56, 22, 9);
    s.lineStyle(3, 0x3a230c, 1);
    s.strokeRoundedRect(8, 14, 56, 52, 9);
    s.fillStyle(0xf5b52e, 1);
    s.fillRect(18, 14, 7, 52);
    s.fillRect(47, 14, 7, 52);
    s.lineStyle(2, 0x8a5a08, 1);
    s.strokeRect(18, 14, 7, 52);
    s.strokeRect(47, 14, 7, 52);
    s.fillStyle(0xffd76a, 1);
    s.fillCircle(36, 40, 8);
    s.fillStyle(0x3a230c, 1);
    s.fillCircle(36, 39, 2.6);
    s.fillRect(34.8, 40, 2.4, 5);
    s.generateTexture('chest', 72, 72);
    s.destroy();

    // Шестерёнка
    s = this.g();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = 22 + Math.cos(a) * 16;
      const cy = 22 + Math.sin(a) * 16;
      s.fillStyle(0xc9a04e, 1);
      s.fillCircle(cx, cy, 4.6);
    }
    s.fillGradientStyle(0xf0d9a0, 0xf0d9a0, 0xc9a04e, 0xc9a04e, 1);
    s.fillCircle(22, 22, 14);
    s.lineStyle(2.5, 0x6e5518, 1);
    s.strokeCircle(22, 22, 13);
    s.fillStyle(0x4c3a10, 1);
    s.fillCircle(22, 22, 5);
    s.generateTexture('gear', 44, 44);
    s.destroy();

    // Мешочек магазина
    s = this.g();
    s.lineStyle(4, 0x8a5a08, 1);
    s.beginPath();
    s.arc(22, 15, 7, Math.PI, 0);
    s.strokePath();
    s.fillGradientStyle(0xe8b84a, 0xe8b84a, 0x9c6a14, 0x9c6a14, 1);
    s.fillRoundedRect(8, 15, 28, 24, 7);
    s.lineStyle(2.5, 0x6e4a0a, 1);
    s.strokeRoundedRect(8, 15, 28, 24, 7);
    s.fillStyle(0xffe493, 1);
    s.fillCircle(22, 27, 5.5);
    s.lineStyle(1.6, 0x8a5a08, 1);
    s.strokeCircle(22, 27, 5.5);
    s.generateTexture('bag', 44, 44);
    s.destroy();

    // Звезда
    s = this.g();
    const starPts: Pt[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 21 : 9;
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      starPts.push([24 + Math.cos(a) * r, 24 + Math.sin(a) * r]);
    }
    s.fillGradientStyle(0xffe493, 0xffe493, 0xf0a51c, 0xf0a51c, 1);
    this.poly(s, starPts);
    s.fillPath();
    s.lineStyle(2.5, 0x8a5a08, 1);
    this.poly(s, starPts);
    s.strokePath();
    s.generateTexture('star', 48, 48);
    s.destroy();

    // Лист
    s = this.g();
    s.fillGradientStyle(0x3f8f5a, 0x3f8f5a, 0x1d4a2e, 0x1d4a2e, 1);
    this.poly(s, [[36, 2], [60, 26], [52, 52], [36, 70], [20, 52], [12, 26]]);
    s.fillPath();
    s.lineStyle(2.5, 0x123321, 1);
    this.poly(s, [[36, 2], [60, 26], [52, 52], [36, 70], [20, 52], [12, 26]]);
    s.strokePath();
    s.lineStyle(2, 0x57b878, 0.6);
    s.lineBetween(36, 8, 36, 64);
    s.generateTexture('leaf', 72, 72);
    s.destroy();

    // Пунктирное кольцо (текущий узел / выделение)
    s = this.g();
    s.lineStyle(6, 0xffd76a, 0.95);
    for (let i = 0; i < 6; i++) {
      s.beginPath();
      s.arc(56, 56, 46, i * (Math.PI / 3) + 0.18, (i + 1) * (Math.PI / 3) - 0.18);
      s.strokePath();
    }
    s.generateTexture('nodeRing', 112, 112);
    s.destroy();

    // Тонкое кольцо выделения самоцвета
    s = this.g();
    s.lineStyle(5, 0xffffff, 0.95);
    s.strokeCircle(48, 48, 40);
    s.lineStyle(2.5, 0xf5b52e, 1);
    s.strokeCircle(48, 48, 44);
    s.generateTexture('ring', 96, 96);
    s.destroy();

    // Стрелка «ты здесь»
    s = this.g();
    s.fillStyle(0xffd76a, 1);
    this.poly(s, [[16, 28], [3, 8], [29, 8]]);
    s.fillPath();
    s.lineStyle(2.5, 0x8a5a08, 1);
    this.poly(s, [[16, 28], [3, 8], [29, 8]]);
    s.strokePath();
    s.generateTexture('arrow', 32, 32);
    s.destroy();

    // Кубок (цель по очкам)
    s = this.g();
    s.fillGradientStyle(0xffe493, 0xffe493, 0xf0a51c, 0xf0a51c, 1);
    s.beginPath();
    s.arc(24, 14, 13, 0, Math.PI);
    s.closePath();
    s.fillPath();
    s.fillRect(11, 12, 26, 5);
    s.fillRect(21, 26, 6, 9);
    s.fillRect(14, 35, 20, 5);
    s.lineStyle(3.5, 0xf0a51c, 1);
    s.beginPath();
    s.arc(8, 15, 6, Math.PI * 0.5, Math.PI * 1.5);
    s.strokePath();
    s.beginPath();
    s.arc(40, 15, 6, -Math.PI * 0.5, Math.PI * 0.5);
    s.strokePath();
    s.lineStyle(2, 0x8a5a08, 1);
    s.strokeRect(14, 35, 20, 5);
    s.generateTexture('trophy', 48, 48);
    s.destroy();

    // Виньетка экрана
    s = this.g();
    const dark = 0x04120a;
    s.fillGradientStyle(dark, dark, dark, dark, 0.5, 0.5, 0, 0);
    s.fillRect(0, 0, GAME_W, 210);
    s.fillGradientStyle(dark, dark, dark, dark, 0, 0, 0.6, 0.6);
    s.fillRect(0, GAME_H - 240, GAME_W, 240);
    s.fillGradientStyle(dark, dark, dark, dark, 0.4, 0, 0, 0.4);
    s.fillRect(0, 0, 90, GAME_H);
    s.fillGradientStyle(dark, dark, dark, dark, 0, 0.4, 0.4, 0);
    s.fillRect(GAME_W - 90, 0, 90, GAME_H);
    s.generateTexture('vignette', GAME_W, GAME_H);
    s.destroy();
  }

  // ---------------- Splash ----------------

  private buildSplash(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f3320, 0x0f3320, 0x061410, 0x061410, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);

    // силуэт пирамиды
    const sil = this.add.graphics();
    sil.fillStyle(0x0a2314, 1);
    for (let step = 0; step < 6; step++) {
      const w = 460 - step * 62;
      const y = GAME_H - 60 - step * 46;
      sil.fillRect((GAME_W - w) / 2, y, w, 46);
    }
    sil.fillStyle(0x0d2b19, 1);
    this.poly(sil, [[0, GAME_H], [0, 700], [150, GAME_H]]);
    sil.fillPath();
    this.poly(sil, [[GAME_W, GAME_H], [GAME_W, 640], [GAME_W - 170, GAME_H]]);
    sil.fillPath();
    sil.fillStyle(0xf5b52e, 0.08);
    sil.fillCircle(GAME_W / 2, 300, 210);
    sil.fillStyle(0xf5b52e, 0.05);
    sil.fillCircle(GAME_W / 2, 300, 280);

    // светлячки
    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: GAME_W },
      y: { min: 0, max: GAME_H },
      lifespan: 4200,
      speed: { min: 4, max: 16 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xffe28a, 0x9dffce],
      frequency: 260,
      blendMode: 'ADD',
    });

    const title1 = this.add
      .text(GAME_W / 2, 190, 'СОКРОВИЩА', {
        fontFamily: '"Russo One"',
        fontSize: '56px',
        color: '#f5b52e',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 8);
    const title2 = this.add
      .text(GAME_W / 2, 252, 'МОНТЕСУМЫ', {
        fontFamily: '"Russo One"',
        fontSize: '44px',
        color: '#f9ecc8',
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 8);

    const deco = this.add.graphics();
    deco.lineStyle(2, 0xf5b52e, 0.6);
    deco.lineBetween(GAME_W / 2 - 190, 300, GAME_W / 2 - 30, 300);
    deco.lineBetween(GAME_W / 2 + 30, 300, GAME_W / 2 + 190, 300);
    deco.fillStyle(0xf5b52e, 1);
    deco.beginPath();
    deco.moveTo(GAME_W / 2, 293);
    deco.lineTo(GAME_W / 2 + 8, 300);
    deco.lineTo(GAME_W / 2, 307);
    deco.lineTo(GAME_W / 2 - 8, 300);
    deco.closePath();
    deco.fillPath();

    // ряд самоцветов
    GEM_KINDS.forEach((kind, i) => {
      const x = 70 + i * 80;
      const spr = this.add.image(x, 430, `gem_${kind}`).setScale(0.62);
      this.tweens.add({
        targets: spr,
        y: 414,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 120,
      });
    });

    const prompt = this.add
      .text(GAME_W / 2, 590, 'НАЖМИ, ЧТОБЫ НАЧАТЬ', {
        fontFamily: '"Russo One"',
        fontSize: '25px',
        color: '#9dffce',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.25 },
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(GAME_W / 2, GAME_H - 60, '24 уровня · 3 главы · боссы и сундуки', {
        fontFamily: '"Rubik"',
        fontSize: '16px',
        color: '#b9ad87',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, GAME_H - 34, 'v0.1 · Phaser 3 · VK Mini Apps', {
        fontFamily: '"Rubik"',
        fontSize: '13px',
        color: '#71806f',
      })
      .setOrigin(0.5);

    this.add.image(GAME_W / 2, GAME_H / 2, 'vignette').setAlpha(0.9);

    const start = () => {
      sfx.unlock();
      sfx.play('chest');
      sfx.vibrate('medium');
      // VK Bridge: инициализация + профиль (не блокирует переход)
      void vk.init().then(async (inVK) => {
        const profile = await vk.getUserProfile();
        if (inVK || profile.id) playerState.applyProfile(profile);
        else if (!playerState.data.name) playerState.applyProfile(profile);
      });
      this.input.keyboard?.removeAllListeners();
      this.cameras.main.fadeOut(380, 4, 16, 10);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MapScene');
        this.scene.launch('UIScene');
      });
    };
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);

    this.cameras.main.fadeIn(400, 4, 16, 10);
    this.tweens.add({ targets: [title1, title2], y: '-=14', duration: 700, ease: 'Cubic.easeOut' });
  }
}
