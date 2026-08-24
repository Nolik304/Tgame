// ============================================================
// BootScene:
//  1) подгружает ТВОИ спрайты фруктов из public/fruits/*.png
//     (если файла нет — рисуется процедурный фолбэк);
//  2) генерирует остальные процедурные текстуры (иконки навыков,
//     сундуки, свечения, частицы, виньетка...);
//  3) показывает splash-экран «Лестница Бога» и по первому
//     касанию разблокирует WebAudio, инициализирует VK Bridge
//     и загружает профиль игрока.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H, FRUIT_KINDS, FRUIT_COLORS, type FruitKind } from '../data/gameData';
import { sfx } from '../services/SoundManager';
import { vk } from '../services/VKBridgeService';
import { playerState } from '../services/PlayerState';

type Pt = { x: number; y: number };

export class BootScene extends Phaser.Scene {
  private failed = new Set<string>();

  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Кастомные спрайты игрока: положи свои PNG в public/fruits/
    // (apple.png, orange.png, grape.png, banana.png, lime.png, berry.png, icon.png).
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.failed.add(file.key));
    for (const k of FRUIT_KINDS) this.load.image(`fruit_${k}`, `fruits/${k}.png`);
    this.load.image('fruitIcon', 'fruits/icon.png');
  }

  create(): void {
    this.buildTextures();
    this.buildSpecialTextures();
    this.showSplash();
  }

  // ---------- Спец-фишки, реликвии комбо и подарки ----------

  private buildSpecialTextures(): void {
    // Аура «Огненного жезла» (матч 4 в ряд)
    let g = this.g();
    g.fillStyle(0xff7a1a, 0.32);
    g.fillCircle(48, 48, 42);
    g.lineStyle(6, 0xffb020, 0.95);
    g.strokeCircle(48, 48, 34);
    g.lineStyle(2.5, 0xffe493, 0.8);
    g.strokeCircle(48, 48, 41);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.5;
      const bx = 48 + Math.cos(a) * 34;
      const by = 48 + Math.sin(a) * 34;
      g.fillStyle(0xffd76a, 0.95);
      g.fillTriangle(bx - 5, by + 3, bx + 5, by + 3, bx, by - 9);
    }
    g.generateTexture('aura_torch', 96, 96);
    g.destroy();

    // Аура «Ока бога» (матч 5 в ряд)
    g = this.g();
    g.fillStyle(0x9dffce, 0.3);
    g.fillCircle(48, 48, 42);
    g.lineStyle(5, 0xf4fff8, 0.95);
    g.strokeCircle(48, 48, 34);
    g.fillStyle(0xf4fff8, 1);
    g.fillEllipse(48, 48, 40, 22);
    g.fillStyle(0x123b52, 1);
    g.fillCircle(48, 48, 9);
    g.fillStyle(0x9dffce, 1);
    g.fillCircle(48, 48, 4);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(45, 45, 2.4);
    g.generateTexture('aura_eye', 96, 96);
    g.destroy();

    // Подарок «Дар богов»
    g = this.g();
    g.fillStyle(0xb8352c, 1);
    g.fillRoundedRect(8, 22, 32, 22, 4);
    g.fillStyle(0xd94a3f, 1);
    g.fillRoundedRect(5, 14, 38, 11, 4);
    g.fillStyle(0xffd76a, 1);
    g.fillRect(21, 14, 6, 30);
    g.lineStyle(3, 0xffd76a, 1);
    g.strokeCircle(18, 11, 5);
    g.strokeCircle(30, 11, 5);
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(11, 26, 9, 15, 3);
    g.generateTexture('gift', 48, 48);
    g.destroy();
  }

  private g(): Phaser.GameObjects.Graphics {
    return this.make.graphics({}, false);
  }

  private buildTextures(): void {
    // ---------- Фрукты (фишки поля) ----------
    for (const kind of FRUIT_KINDS) {
      if (!this.failed.has(`fruit_${kind}`)) continue; // загружен твой спрайт
      const c = FRUIT_COLORS[kind];
      const g = this.g();
      this.drawFruit(g, kind, c);
      g.generateTexture(`fruit_${kind}`, 96, 96);
      g.destroy();
    }
    if (this.failed.has('fruitIcon')) {
      const b = this.g();
      b.fillStyle(0xc98a12, 1);
      b.fillRoundedRect(4, 20, 40, 22, 8);
      b.lineStyle(3, 0xf5b52e, 1);
      b.strokeRoundedRect(4, 20, 40, 22, 8);
      b.fillStyle(0xe8384f, 1);
      b.fillCircle(16, 16, 7);
      b.fillStyle(0x7ed321, 1);
      b.fillCircle(30, 14, 7);
      b.fillStyle(0xb06bff, 1);
      b.fillCircle(23, 22, 6);
      b.generateTexture('fruitIcon', 48, 48);
      b.destroy();
    }

    // ---------- Иконки боевых навыков ----------
    this.genSkillFire();
    this.genSkillBolt();
    this.genSkillWind();

    // ---------- Сердце ----------
    const h = this.g();
    h.fillStyle(0xff4b5c, 1);
    h.fillCircle(16, 14, 10);
    h.fillCircle(32, 14, 10);
    h.fillTriangle(6, 18, 42, 18, 24, 42);
    h.fillStyle(0xffffff, 0.35);
    h.fillCircle(13, 11, 4);
    h.generateTexture('heart', 48, 48);
    h.destroy();

    // ---------- Монета ----------
    const coin = this.g();
    coin.fillStyle(0xc98a12, 1);
    coin.fillCircle(24, 24, 21);
    coin.fillStyle(0xffd34d, 1);
    coin.fillCircle(24, 24, 17);
    coin.lineStyle(3, 0xb8791a, 1);
    coin.strokeCircle(24, 24, 12);
    coin.fillStyle(0xc98a12, 1);
    coin.fillRoundedRect(20, 14, 8, 20, 3);
    coin.generateTexture('coin', 48, 48);
    coin.destroy();

    // ---------- Гем (премиум-валюта) ----------
    const s = this.g();
    const V2 = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    s.fillStyle(0x17c98d, 1);
    s.fillPoints([V2(24, 3), V2(45, 24), V2(24, 45), V2(3, 24)], true);
    s.fillStyle(0x8dffe0, 1);
    s.fillPoints([V2(24, 10), V2(36, 24), V2(24, 38), V2(12, 24)], true);
    s.fillStyle(0xffffff, 0.85);
    s.fillCircle(19, 15, 3);
    s.generateTexture('gemIcon', 48, 48);
    s.destroy();

    // ---------- Замок ----------
    const lock = this.g();
    lock.lineStyle(7, 0x93a196, 1);
    lock.strokeCircle(24, 16, 10);
    lock.fillStyle(0x8d9b90, 1);
    lock.fillRoundedRect(6, 20, 36, 26, 6);
    lock.fillStyle(0x2c342e, 1);
    lock.fillCircle(24, 31, 4.5);
    lock.fillRoundedRect(21.5, 31, 5, 9, 2);
    lock.generateTexture('lock', 48, 48);
    lock.destroy();

    // ---------- Звезда ----------
    const st = this.g();
    st.fillStyle(0xffd76a, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 22 : 9.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(24 + r * Math.cos(a), 24 + r * Math.sin(a)));
    }
    st.fillPoints(pts, true);
    st.fillStyle(0xfff2b8, 1);
    st.fillCircle(20, 18, 4);
    st.generateTexture('star', 48, 48);
    st.destroy();

    // ---------- Сундук ----------
    const ch = this.g();
    ch.fillStyle(0x6b4318, 1);
    ch.fillRoundedRect(4, 30, 88, 58, 8);
    ch.fillStyle(0x8a5a24, 1);
    ch.fillRoundedRect(4, 14, 88, 34, { tl: 26, tr: 26, bl: 0, br: 0 });
    ch.fillStyle(0xf5b52e, 1);
    ch.fillRect(4, 44, 88, 6);
    ch.fillRect(14, 14, 7, 74);
    ch.fillRect(75, 14, 7, 74);
    ch.fillStyle(0xffd76a, 1);
    ch.fillRoundedRect(38, 40, 20, 26, 4);
    ch.fillStyle(0x6b4318, 1);
    ch.fillCircle(48, 51, 4);
    ch.generateTexture('chest', 96, 96);
    ch.destroy();

    // ---------- Череп босса ----------
    const sk = this.g();
    sk.fillStyle(0xd9dde2, 1);
    sk.fillCircle(32, 26, 20);
    sk.fillRoundedRect(18, 34, 28, 20, 8);
    sk.fillStyle(0x1a2126, 1);
    sk.fillCircle(24, 26, 6.5);
    sk.fillCircle(40, 26, 6.5);
    sk.fillTriangle(32, 30, 28, 38, 36, 38);
    sk.fillRect(24, 46, 4, 8);
    sk.fillRect(31, 46, 4, 8);
    sk.fillRect(38, 46, 4, 8);
    sk.fillStyle(0xff5a5a, 0.9);
    sk.fillCircle(24, 26, 2.6);
    sk.fillCircle(40, 26, 2.6);
    sk.generateTexture('skull', 64, 64);
    sk.destroy();

    // ---------- Свечение ----------
    const glow = this.g();
    for (let i = 12; i >= 1; i--) {
      glow.fillStyle(0xffffff, 0.055);
      glow.fillCircle(64, 64, i * 5.3);
    }
    glow.generateTexture('glow', 128, 128);
    glow.destroy();

    // ---------- Частица-искра ----------
    const sp = this.g();
    sp.fillStyle(0xffffff, 1);
    sp.fillCircle(8, 8, 7);
    sp.fillStyle(0xffffff, 0.55);
    sp.fillCircle(8, 8, 4);
    sp.generateTexture('spark', 16, 16);
    sp.destroy();

    // ---------- Пылинка (фон карты) ----------
    const m = this.g();
    m.fillStyle(0xffffff, 0.9);
    m.fillCircle(5, 5, 4);
    m.fillStyle(0xffffff, 0.35);
    m.fillCircle(5, 5, 2);
    m.generateTexture('mote', 10, 10);
    m.destroy();

    // ---------- Кольцо выделения ----------
    const rg = this.g();
    rg.lineStyle(5, 0xffffff, 0.95);
    rg.strokeCircle(48, 48, 40);
    rg.lineStyle(2, 0xffffff, 0.4);
    rg.strokeCircle(48, 48, 33);
    rg.generateTexture('ring', 96, 96);
    rg.destroy();

    // ---------- Виньетка ----------
    const v = this.g();
    for (let i = 0; i < 26; i++) {
      v.fillStyle(0x000000, 0.028);
      v.fillRoundedRect(i * 6, i * 6, GAME_W - i * 12, GAME_H - i * 12, 20);
    }
    v.generateTexture('vignette', GAME_W, GAME_H);
    v.destroy();
  }

  // ---------------- Процедурные фрукты ----------------

  private drawFruit(
    g: Phaser.GameObjects.Graphics,
    kind: FruitKind,
    c: { main: number; light: number; dark: number },
  ): void {
    switch (kind) {
      case 'apple': {
        g.fillStyle(c.dark, 1);
        g.fillCircle(48, 56, 34);
        g.fillGradientStyle(c.light, c.light, c.main, c.main, 1);
        g.fillCircle(46, 54, 31);
        g.fillStyle(0x8a5a2a, 1);
        g.fillRoundedRect(45, 12, 6, 16, 3);
        g.fillStyle(0x4caf50, 1);
        g.fillTriangle(52, 16, 78, 10, 62, 30);
        g.lineStyle(6, 0xffffff, 0.5);
        g.beginPath();
        g.arc(40, 48, 20, 190, 250);
        g.strokePath();
        break;
      }
      case 'orange': {
        g.fillStyle(c.dark, 1);
        g.fillCircle(48, 54, 34);
        g.fillGradientStyle(c.light, c.light, c.main, c.main, 1);
        g.fillCircle(46, 52, 31);
        g.fillStyle(c.dark, 0.5);
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7;
          g.fillCircle(46 + Math.cos(a * 2.4) * 18, 52 + Math.sin(a * 3.1) * 18, 1.8);
        }
        g.fillStyle(0x4caf50, 1);
        g.fillTriangle(44, 16, 66, 8, 56, 26);
        g.lineStyle(6, 0xffffff, 0.5);
        g.beginPath();
        g.arc(40, 46, 20, 190, 250);
        g.strokePath();
        break;
      }
      case 'grape': {
        const berries: Pt[] = [
          { x: 36, y: 36 }, { x: 60, y: 36 }, { x: 24, y: 52 }, { x: 48, y: 50 },
          { x: 72, y: 52 }, { x: 36, y: 66 }, { x: 60, y: 66 }, { x: 48, y: 80 },
        ];
        g.fillStyle(0x4caf50, 1);
        g.fillTriangle(40, 14, 66, 8, 54, 26);
        g.fillStyle(0x8a5a2a, 1);
        g.fillRoundedRect(45, 14, 5, 12, 2);
        for (const p of berries) {
          g.fillStyle(c.dark, 1);
          g.fillCircle(p.x, p.y, 13.5);
          g.fillStyle(c.main, 1);
          g.fillCircle(p.x - 1.5, p.y - 1.5, 11.5);
          g.fillStyle(c.light, 0.7);
          g.fillCircle(p.x - 4, p.y - 4, 3);
        }
        break;
      }
      case 'banana': {
        g.lineStyle(22, c.dark, 1);
        g.beginPath();
        g.arc(48, 28, 30, 40, 140);
        g.strokePath();
        g.lineStyle(17, c.main, 1);
        g.beginPath();
        g.arc(48, 27, 30, 42, 138);
        g.strokePath();
        g.lineStyle(6, c.light, 0.8);
        g.beginPath();
        g.arc(48, 26, 30, 65, 115);
        g.strokePath();
        g.fillStyle(0x8a5a2a, 1);
        g.fillCircle(71, 47, 5);
        g.fillCircle(25, 47, 5);
        break;
      }
      case 'lime': {
        g.fillStyle(0x3f8f14, 1);
        g.fillCircle(48, 50, 35);
        g.fillStyle(0xd9f5a3, 1);
        g.fillCircle(48, 50, 29);
        g.lineStyle(4, 0xf7ffe0, 1);
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          g.lineBetween(48, 50, 48 + Math.cos(a) * 26, 50 + Math.sin(a) * 26);
        }
        g.fillStyle(0xf7ffe0, 1);
        g.fillCircle(48, 50, 5);
        g.lineStyle(5, 0xffffff, 0.45);
        g.beginPath();
        g.arc(44, 44, 26, 195, 245);
        g.strokePath();
        break;
      }
      case 'berry': {
        g.fillStyle(c.dark, 1);
        g.fillCircle(48, 56, 32);
        g.fillGradientStyle(c.light, c.light, c.main, c.main, 1);
        g.fillCircle(46, 54, 29);
        g.fillStyle(0x2c3a6e, 1);
        const crown: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          crown.push(new Phaser.Math.Vector2(48 + Math.cos(a) * 7, 26 + Math.sin(a) * 7));
        }
        g.fillPoints(crown, true);
        g.lineStyle(6, 0xffffff, 0.5);
        g.beginPath();
        g.arc(40, 48, 19, 190, 250);
        g.strokePath();
        break;
      }
    }
  }

  // ---------------- Иконки навыков ----------------

  private genSkillFire(): void {
    const g = this.g();
    g.fillStyle(0xff7a2a, 0.22);
    g.fillCircle(32, 34, 29);
    g.fillStyle(0xff7a2a, 1);
    g.fillTriangle(32, 4, 52, 40, 12, 40);
    g.fillCircle(32, 44, 15);
    g.fillStyle(0xffd23e, 1);
    g.fillTriangle(32, 20, 44, 44, 20, 44);
    g.fillCircle(32, 46, 9);
    g.fillStyle(0xfff0a8, 1);
    g.fillCircle(32, 48, 4);
    g.generateTexture('skill_fire', 64, 64);
    g.destroy();
  }

  private genSkillBolt(): void {
    const g = this.g();
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    const bolt: Phaser.Math.Vector2[] = [
      V(38, 2), V(13, 35), V(27, 35), V(23, 62), V(51, 25), V(35, 25),
    ];
    g.fillStyle(0xffe24a, 0.22);
    g.fillCircle(32, 32, 29);
    g.fillStyle(0xffe24a, 1);
    g.fillPoints(bolt, true);
    g.lineStyle(3, 0xb08a00, 1);
    g.strokePoints(bolt, true);
    g.generateTexture('skill_bolt', 64, 64);
    g.destroy();
  }

  private genSkillWind(): void {
    const g = this.g();
    g.fillStyle(0x9dffce, 0.16);
    g.fillCircle(32, 32, 29);
    g.lineStyle(6, 0x9dffce, 1);
    g.beginPath();
    g.arc(30, 32, 9, -100, 130);
    g.strokePath();
    g.beginPath();
    g.arc(32, 32, 17, -70, 160);
    g.strokePath();
    g.lineStyle(5, 0x4ddba0, 1);
    g.beginPath();
    g.arc(34, 32, 25, -40, 190);
    g.strokePath();
    g.fillStyle(0xeafff5, 1);
    g.fillCircle(30, 32, 3.4);
    g.generateTexture('skill_wind', 64, 64);
    g.destroy();
  }

  // ---------------- Splash ----------------

  private showSplash(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d2818, 0x0d2818, 0x050f0a, 0x050f0a, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.fillStyle(0xf5b52e, 0.06);
    bg.fillCircle(GAME_W / 2, 300, 260);

    const glow = this.add.image(GAME_W / 2, 296, 'glow').setTint(0xf5b52e).setScale(2.6).setAlpha(0.8);
    this.tweens.add({ targets: glow, scale: 3, alpha: 0.55, duration: 1400, yoyo: true, repeat: -1 });

    // силуэт лестницы-пирамиды
    const pyr = this.add.graphics();
    pyr.fillStyle(0x123724, 1);
    for (let i = 0; i < 6; i++) {
      const w = 320 - i * 44;
      pyr.fillRect(GAME_W / 2 - w / 2, 700 - i * 52, w, 50);
    }
    pyr.fillStyle(0xf5b52e, 0.8);
    pyr.fillTriangle(GAME_W / 2 - 26, 388, GAME_W / 2 + 26, 388, GAME_W / 2, 344);

    const title1 = this.add
      .text(GAME_W / 2, 180, 'ЛЕСТНИЦА', {
        fontFamily: '"Russo One"',
        fontSize: '54px',
        color: '#f9ecc8',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 10);
    const title2 = this.add
      .text(GAME_W / 2, 246, 'БОГА', {
        fontFamily: '"Russo One"',
        fontSize: '54px',
        color: '#f5b52e',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 10);
    this.tweens.add({ targets: [title1, title2], y: '-=8', duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ряд фруктов
    FRUIT_KINDS.forEach((kind, i) => {
      const x = 70 + i * 80;
      const spr = this.add.image(x, 840, `fruit_${kind}`).setScale(0.52);
      this.tweens.add({
        targets: spr,
        y: 830,
        duration: 900 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    const tap = this.add
      .text(GAME_W / 2, 560, '— коснись, чтобы начать восхождение —', {
        fontFamily: '"Rubik"',
        fontSize: '17px',
        color: '#c9b98f',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.add
      .text(GAME_W / 2, 926, 'три в ряд · VK Mini Apps', {
        fontFamily: '"Rubik"',
        fontSize: '12px',
        color: '#5f6f5f',
      })
      .setOrigin(0.5);

    const zone = this.add.zone(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H).setInteractive();
    zone.once('pointerdown', () => {
      sfx.unlock();
      sfx.play('click');
      this.cameras.main.fadeOut(380, 4, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, async () => {
        await vk.init();
        const profile = await vk.getUserProfile();
        playerState.applyProfile(profile);
        this.scene.start('MapScene');
        this.scene.launch('UIScene');
      });
    });
  }
}
