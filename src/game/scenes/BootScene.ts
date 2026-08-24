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
    this.buildObstacleTextures();
    this.buildCardTextures();
    this.showSplash();
  }

  // ---------- Препятствия, идолы, Жар-птица ----------

  private buildObstacleTextures(): void {
    // Лиана: переплетение стеблей
    let g = this.g();
    g.fillStyle(0x0e3a1e, 0.9);
    g.fillCircle(48, 48, 30);
    g.lineStyle(7, 0x2e7d32, 1);
    g.strokeCircle(48, 48, 22);
    g.lineStyle(5, 0x4caf50, 1);
    g.beginPath();
    g.moveTo(20, 70);
    g.lineTo(76, 26);
    g.strokePath();
    g.beginPath();
    g.moveTo(76, 70);
    g.lineTo(20, 26);
    g.strokePath();
    g.fillStyle(0x7ed321, 1);
    g.fillEllipse(30, 30, 16, 9);
    g.fillEllipse(66, 66, 16, 9);
    g.fillEllipse(66, 30, 16, 9);
    g.generateTexture('vine', 96, 96);
    g.destroy();

    // Каменная плита (2 удара)
    const slab = (key: string, cracked: boolean) => {
      const s = this.g();
      s.fillStyle(0x6d6f76, 1);
      s.fillRoundedRect(10, 14, 76, 68, 10);
      s.fillStyle(0x8b8e96, 1);
      s.fillRoundedRect(16, 20, 64, 26, 8);
      s.fillStyle(0x52545c, 1);
      s.fillRoundedRect(16, 52, 64, 24, 8);
      s.lineStyle(4, 0x3c3e45, 1);
      s.strokeRoundedRect(10, 14, 76, 68, 10);
      // руны
      s.lineStyle(3, 0xb8b39f, 0.8);
      s.strokeCircle(48, 48, 12);
      s.lineBetween(48, 30, 48, 66);
      if (cracked) {
        s.lineStyle(3.5, 0x23242a, 1);
        s.beginPath();
        s.moveTo(30, 14);
        s.lineTo(44, 38);
        s.lineTo(34, 56);
        s.lineTo(52, 82);
        s.strokePath();
        s.beginPath();
        s.moveTo(70, 18);
        s.lineTo(60, 44);
        s.lineTo(72, 62);
        s.strokePath();
      }
      s.generateTexture(key, 96, 96);
      s.destroy();
    };
    slab('slab', false);
    slab('slab_crack', true);

    // Лёд (заморозка клетки боссом)
    g = this.g();
    g.fillStyle(0x9adcf5, 0.42);
    g.fillRoundedRect(8, 8, 80, 80, 12);
    g.lineStyle(4, 0xcdf0ff, 0.9);
    g.strokeRoundedRect(8, 8, 80, 80, 12);
    g.lineStyle(2.5, 0xe8f9ff, 0.85);
    g.lineBetween(20, 76, 46, 20);
    g.lineBetween(46, 20, 60, 40);
    g.lineBetween(60, 40, 78, 18);
    g.fillStyle(0xffffff, 0.5);
    g.fillTriangle(18, 18, 34, 14, 22, 32);
    g.generateTexture('ice', 96, 96);
    g.destroy();

    // Идол (цель «опусти вниз»)
    g = this.g();
    g.fillStyle(0x8a6a20, 1);
    g.fillRoundedRect(20, 12, 56, 72, 12);
    g.fillStyle(0xf5b52e, 1);
    g.fillRoundedRect(24, 16, 48, 64, 10);
    g.fillStyle(0x5c4409, 1);
    g.fillRoundedRect(32, 30, 12, 10, 3);
    g.fillRoundedRect(52, 30, 12, 10, 3);
    g.fillRoundedRect(36, 56, 24, 9, 4);
    g.lineStyle(3, 0x8a6a20, 1);
    g.lineBetween(32, 48, 64, 48);
    g.fillStyle(0xfff2c9, 0.85);
    g.fillRoundedRect(28, 19, 16, 7, 3);
    g.generateTexture('idol', 96, 96);
    g.destroy();

    // Жар-птица (кнопка ивента)
    g = this.g();
    // хвост-пламя
    g.fillStyle(0xff5a2a, 1);
    g.fillTriangle(20, 84, 40, 48, 44, 86);
    g.fillStyle(0xffb020, 1);
    g.fillTriangle(34, 88, 46, 56, 56, 88);
    // тело
    g.fillStyle(0xff7a1a, 1);
    g.fillCircle(50, 42, 20);
    // крыло
    g.fillStyle(0xffd76a, 1);
    g.fillTriangle(36, 40, 62, 24, 66, 52);
    // голова + клюв
    g.fillStyle(0xffb020, 1);
    g.fillCircle(64, 26, 10);
    g.fillStyle(0xfff2c9, 1);
    g.fillTriangle(72, 22, 84, 26, 72, 30);
    g.fillStyle(0x3c1a05, 1);
    g.fillCircle(66, 24, 2.4);
    // хохолок
    g.fillStyle(0xff5a2a, 1);
    g.fillTriangle(58, 14, 64, 4, 68, 16);
    g.generateTexture('bird', 96, 96);
    g.destroy();
  }

  // ---------- Коллекционные карты ----------

  private buildCardTextures(): void {
    // Рубашка карты
    const bg = this.g();
    bg.fillStyle(0x123024, 1);
    bg.fillRoundedRect(4, 2, 56, 76, 8);
    bg.lineStyle(3, 0xf5b52e, 1);
    bg.strokeRoundedRect(4, 2, 56, 76, 8);
    bg.fillStyle(0x1d4a35, 1);
    bg.fillRoundedRect(9, 7, 46, 66, 5);
    bg.generateTexture('card', 64, 80);
    bg.destroy();

    const icon = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = this.g();
      draw(g);
      g.generateTexture(key, 48, 48);
      g.destroy();
    };

    icon('card_feather', (g) => {
      g.fillStyle(0x2ecc71, 1);
      g.fillEllipse(24, 22, 16, 34);
      g.fillStyle(0x9dffce, 1);
      g.fillEllipse(21, 20, 7, 26);
      g.lineStyle(3, 0x0c6b38, 1);
      g.lineBetween(24, 6, 24, 44);
    });
    icon('card_mask', (g) => {
      g.fillStyle(0xf5b52e, 1);
      g.fillRoundedRect(10, 8, 28, 34, 8);
      g.fillStyle(0x3c2a05, 1);
      g.fillEllipse(18, 20, 8, 5);
      g.fillEllipse(30, 20, 8, 5);
      g.fillRoundedRect(18, 30, 12, 5, 2);
      g.fillStyle(0xe8384f, 1);
      g.fillTriangle(14, 8, 24, 0, 24, 8);
      g.fillTriangle(24, 8, 34, 0, 34, 8);
    });
    icon('card_sun', (g) => {
      g.fillStyle(0xffb020, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.fillTriangle(
          24 + Math.cos(a - 0.22) * 13, 24 + Math.sin(a - 0.22) * 13,
          24 + Math.cos(a + 0.22) * 13, 24 + Math.sin(a + 0.22) * 13,
          24 + Math.cos(a) * 23, 24 + Math.sin(a) * 23,
        );
      }
      g.fillCircle(24, 24, 12);
      g.fillStyle(0xfff2c9, 1);
      g.fillCircle(21, 21, 4);
    });
    icon('card_moon', (g) => {
      g.fillStyle(0xcfe3ff, 1);
      g.fillCircle(22, 24, 15);
      g.fillStyle(0x1d4a35, 1);
      g.fillCircle(30, 19, 13);
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(14, 14, 1.6);
      g.fillCircle(18, 34, 1.3);
    });
    icon('card_idolcard', (g) => {
      g.fillStyle(0x2ecc71, 1);
      g.fillRoundedRect(12, 6, 24, 36, 7);
      g.fillStyle(0x0c6b38, 1);
      g.fillRoundedRect(17, 14, 6, 5, 2);
      g.fillRoundedRect(25, 14, 6, 5, 2);
      g.fillRoundedRect(19, 28, 10, 4, 2);
    });
    icon('card_blade', (g) => {
      g.fillStyle(0x3c3e45, 1);
      g.fillTriangle(24, 2, 32, 32, 16, 32);
      g.fillStyle(0x6d6f76, 1);
      g.fillTriangle(24, 2, 28, 32, 24, 32);
      g.fillStyle(0x8a6a20, 1);
      g.fillRect(14, 32, 20, 5);
      g.fillStyle(0x5c4409, 1);
      g.fillRect(21, 37, 6, 9);
    });
    icon('card_snake', (g) => {
      g.lineStyle(6, 0x2ecc71, 1);
      g.beginPath();
      g.moveTo(10, 38);
      g.lineTo(20, 20);
      g.lineTo(30, 34);
      g.lineTo(38, 12);
      g.strokePath();
      g.fillStyle(0x9dffce, 1);
      g.fillCircle(38, 11, 5);
      g.fillStyle(0xe8384f, 1);
      g.fillTriangle(40, 7, 46, 4, 42, 12);
    });
    icon('card_eyecard', (g) => {
      g.fillStyle(0xf4fff8, 1);
      g.fillEllipse(24, 24, 36, 18);
      g.fillStyle(0x35d0c0, 1);
      g.fillCircle(24, 24, 8);
      g.fillStyle(0x052018, 1);
      g.fillCircle(24, 24, 4);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(22, 22, 1.8);
      g.lineStyle(2.5, 0x0f6e63, 1);
      g.strokeEllipse(24, 24, 36, 18);
    });
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

  /** Универсальный самоцвет-фолбэк (если твой PNG не загрузился). Цвет берётся из FRUIT_COLORS. */
  private drawFruit(
    g: Phaser.GameObjects.Graphics,
    _kind: FruitKind,
    c: { main: number; light: number; dark: number },
  ): void {
    // огранённый камень: тёмная подложка + градиентное тело + блики
    g.fillStyle(c.dark, 1);
    g.fillCircle(48, 50, 35);
    g.fillGradientStyle(c.light, c.light, c.main, c.main, 1);
    g.fillCircle(46, 48, 32);
    // грани
    g.lineStyle(3, c.light, 0.5);
    g.strokeCircle(46, 48, 22);
    g.lineStyle(2.5, c.light, 0.4);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.lineBetween(46 + Math.cos(a) * 10, 48 + Math.sin(a) * 10, 46 + Math.cos(a) * 30, 48 + Math.sin(a) * 30);
    }
    // центральный блик
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(38, 40, 6);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(52, 34, 3);
    // контур-обводка
    g.lineStyle(5, 0xffffff, 0.35);
    g.beginPath();
    g.arc(42, 42, 26, 195, 250);
    g.strokePath();
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
