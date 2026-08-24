// ============================================================
// BootScene:
//  1) подгружает ТВОИ спрайты (public/fruits, public/skills,
//     public/sprites) — если файла нет, игра не падает;
//  2) процедурно дорисовывает всё недостающее (полностью
//     играбельно без единого ассета);
//  3) splash «нажми, чтобы начать»: разблокировка аудио,
//     инициализация VK Bridge, получение профиля ВК.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H, FRUIT_KINDS, FRUIT_COLORS, type FruitKind } from '../data/gameData';
import { playerState } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';
import { vk } from '../services/VKBridgeService';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Твои спрайты фишек: public/fruits/0.png ... 5.png + icon.png
    for (let i = 0; i <= 5; i++) this.load.image(`fruit_${i}`, `fruits/${i}.png`);
    this.load.image('shop_icon', 'fruits/icon.png');
    // Иконки тотемов: public/skills/red|green|blue.png
    this.load.image('skill_red', 'skills/red.png');
    this.load.image('skill_green', 'skills/green.png');
    this.load.image('skill_blue', 'skills/blue.png');
    // Прочие заменяемые спрайты: public/sprites/*.png
    for (const name of ['vine', 'slab', 'slab_crack', 'ice', 'idol', 'bird', 'bomb', 'chest', 'skull']) {
      this.load.image(name, `sprites/${name}.png`);
    }
    // Ошибки загрузки (403/404) не должны ломать игру
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // просто пропускаем — процедурный фолбэк нарисует замену
      if (file && file.key) {
        /* noop */
      }
    });
  }

  create(): void {
    this.buildTextures();
    this.showSplash();
  }

  /** Текстура существует и загрузилась успешно? */
  private has(key: string): boolean {
    const tex = this.textures.get(key);
    return !!tex && tex.key !== '__MISSING';
  }

  private g(): Phaser.GameObjects.Graphics {
    return this.make.graphics({}, false);
  }

  // ============================================================

  private buildTextures(): void {
    this.buildFruits();
    this.buildIcons();
    this.buildObstacles();
    this.buildSpecials();
    this.buildSkillIcons();
  }

  // ---------- Кристаллы ----------

  private buildFruits(): void {
    FRUIT_KINDS.concat(['5']).forEach((kind) => {
      const key = `fruit_${kind}`;
      if (this.has(key)) return; // твой спрайт уже загружен
      const g = this.g();
      this.drawFruit(g, kind, FRUIT_COLORS[kind]);
      g.generateTexture(key, 96, 96);
      g.destroy();
    });
  }

  /** Процедурный самоцвет: у каждого вида — своя форма огранки. */
  private drawFruit(
    g: Phaser.GameObjects.Graphics,
    kind: FruitKind,
    c: { main: number; light: number; dark: number },
  ): void {
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    let outline: Phaser.Math.Vector2[];
    switch (kind) {
      case '0':
        outline = [V(30, 22), V(66, 22), V(84, 46), V(48, 86), V(12, 46)];
        break;
      case '1':
        outline = [V(30, 16), V(66, 16), V(80, 30), V(80, 66), V(66, 80), V(30, 80), V(16, 66), V(16, 30)];
        break;
      case '2':
        outline = [V(24, 20), V(72, 20), V(82, 44), V(48, 86), V(14, 44)];
        break;
      case '3':
        outline = [V(48, 12), V(82, 30), V(82, 66), V(48, 84), V(14, 66), V(14, 30)];
        break;
      case '5':
        outline = [V(48, 10), V(86, 48), V(48, 86), V(10, 48)];
        break;
      default:
        outline = [V(48, 84), V(16, 52), V(14, 32), V(30, 18), V(48, 30), V(66, 18), V(82, 32), V(80, 52)];
        break;
    }
    g.fillStyle(c.light, 0.16);
    g.fillCircle(48, 50, 42);
    g.fillStyle(c.dark, 1);
    g.fillPoints(outline, true);
    const inner = outline.map((p) => V(48 + (p.x - 48) * 0.9, 50 + (p.y - 50) * 0.9));
    g.fillGradientStyle(c.light, c.light, c.main, c.main, 1);
    g.fillPoints(inner, true);
    g.lineStyle(2.5, c.dark, 0.55);
    for (const p of inner) g.lineBetween(48, 50, p.x, p.y);
    g.fillStyle(c.light, 0.55);
    g.fillPoints([V(38, 26), V(58, 26), V(64, 36), V(48, 44), V(32, 36)], true);
    g.fillStyle(0xffffff, 0.8);
    g.fillTriangle(36, 30, 39, 37, 33, 37);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(60, 30, 3);
    g.lineStyle(4, 0xffffff, 0.4);
    g.beginPath();
    g.arc(44, 42, 24, 195, 248);
    g.strokePath();
  }

  // ---------- Иконки и частицы ----------

  private buildIcons(): void {
    // glow — мягкое свечение
    let g = this.g();
    for (let r = 48; r > 0; r -= 2) {
      g.fillStyle(0xffffff, 0.035);
      g.fillCircle(48, 48, r);
    }
    g.generateTexture('glow', 96, 96);
    g.destroy();

    // spark — частица
    g = this.g();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 7);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(8, 8, 4);
    g.generateTexture('spark', 16, 16);
    g.destroy();

    // ring — кольцо выделения
    g = this.g();
    g.lineStyle(5, 0xffd76a, 1);
    g.strokeCircle(32, 32, 26);
    g.lineStyle(2, 0xfff2c9, 0.8);
    g.strokeCircle(32, 32, 21);
    g.generateTexture('ring', 64, 64);
    g.destroy();

    // монета
    g = this.g();
    g.fillStyle(0x8a5a08, 1);
    g.fillCircle(24, 25, 21);
    g.fillStyle(0xf5b52e, 1);
    g.fillCircle(24, 24, 21);
    g.fillStyle(0xffd76a, 1);
    g.fillCircle(22, 22, 17);
    g.lineStyle(3, 0x8a5a08, 1);
    g.strokeCircle(24, 24, 14);
    g.fillStyle(0x8a5a08, 1);
    g.fillRect(21, 16, 6, 16);
    g.fillStyle(0xfff2c9, 0.9);
    g.fillCircle(17, 16, 3.4);
    g.generateTexture('coin', 48, 48);
    g.destroy();

    // гемы (премиум-валюта)
    g = this.g();
    const gemPts = [
      new Phaser.Math.Vector2(16, 12), new Phaser.Math.Vector2(32, 12),
      new Phaser.Math.Vector2(42, 22), new Phaser.Math.Vector2(24, 42),
      new Phaser.Math.Vector2(6, 22),
    ];
    g.fillStyle(0x123b52, 1);
    g.fillPoints(gemPts, true);
    g.fillGradientStyle(0x9dffce, 0x9dffce, 0x2ec9a0, 0x2ec9a0, 1);
    g.fillPoints(gemPts.map((p) => new Phaser.Math.Vector2(24 + (p.x - 24) * 0.86, 26 + (p.y - 26) * 0.86)), true);
    g.lineStyle(2, 0x0b6b52, 1);
    g.strokePoints(gemPts, true);
    g.fillStyle(0xffffff, 0.75);
    g.fillTriangle(16, 16, 22, 14, 18, 21);
    g.generateTexture('gemIcon', 48, 48);
    g.destroy();

    // сердце
    g = this.g();
    g.fillStyle(0xff5a76, 1);
    g.fillCircle(16, 18, 11);
    g.fillCircle(32, 18, 11);
    g.fillTriangle(5, 22, 43, 22, 24, 44);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(14, 15, 4);
    g.generateTexture('heart', 48, 48);
    g.destroy();

    // шестерёнка настроек
    g = this.g();
    g.fillStyle(0x8fd8b4, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.fillRect(24 + Math.cos(a) * 16 - 4, 24 + Math.sin(a) * 16 - 4, 8, 8);
    }
    g.fillCircle(24, 24, 15);
    g.fillStyle(0x0e2519, 1);
    g.fillCircle(24, 24, 7);
    g.generateTexture('gear', 48, 48);
    g.destroy();

    // сумка магазина
    g = this.g();
    g.fillStyle(0xf5b52e, 1);
    g.fillRoundedRect(8, 16, 32, 26, 6);
    g.lineStyle(4, 0x8a5a08, 1);
    g.beginPath();
    g.arc(24, 16, 10, Math.PI, 0);
    g.strokePath();
    g.fillStyle(0x8a5a08, 1);
    g.fillCircle(24, 29, 4);
    g.generateTexture('bag', 48, 48);
    g.destroy();

    // подарок
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

  // ---------- Препятствия и объекты ----------

  private buildObstacles(): void {
    // сундук
    if (!this.has('chest')) {
      const g = this.g();
      g.fillStyle(0x6e4a12, 1);
      g.fillRoundedRect(6, 26, 84, 56, 10);
      g.fillStyle(0x96691c, 1);
      g.fillRoundedRect(6, 14, 84, 30, 12);
      g.fillStyle(0xf5b52e, 1);
      g.fillRect(6, 40, 84, 6);
      g.fillRect(40, 14, 8, 68);
      g.fillStyle(0xffd76a, 1);
      g.fillRoundedRect(38, 44, 20, 18, 5);
      g.fillStyle(0x6e4a12, 1);
      g.fillCircle(48, 52, 4);
      g.fillStyle(0xfff2c9, 0.35);
      g.fillRoundedRect(12, 18, 26, 8, 4);
      g.generateTexture('chest', 96, 96);
      g.destroy();
    }

    // череп босса
    if (!this.has('skull')) {
      const g = this.g();
      g.fillStyle(0xd9d2bd, 1);
      g.fillCircle(48, 40, 26);
      g.fillRoundedRect(30, 56, 36, 20, 8);
      g.fillStyle(0x33261a, 1);
      g.fillCircle(38, 40, 8);
      g.fillCircle(58, 40, 8);
      g.fillTriangle(48, 46, 44, 56, 52, 56);
      g.fillRect(38, 66, 4, 10);
      g.fillRect(46, 66, 4, 10);
      g.fillRect(54, 66, 4, 10);
      g.fillStyle(0xff5a4a, 0.9);
      g.fillCircle(38, 40, 3.4);
      g.fillCircle(58, 40, 3.4);
      g.generateTexture('skull', 96, 96);
      g.destroy();
    }

    // лиана
    if (!this.has('vine')) {
      const g = this.g();
      g.lineStyle(9, 0x2e7d32, 1);
      g.beginPath();
      g.arc(48, 48, 26, 30, 330);
      g.strokePath();
      g.lineStyle(5, 0x7ed321, 1);
      g.beginPath();
      g.arc(48, 48, 26, 60, 300);
      g.strokePath();
      g.fillStyle(0x7ed321, 1);
      g.fillTriangle(70, 34, 86, 28, 76, 46);
      g.fillTriangle(26, 62, 10, 68, 20, 50);
      g.fillStyle(0x2e7d32, 1);
      g.fillCircle(48, 48, 7);
      g.generateTexture('vine', 96, 96);
      g.destroy();
    }

    // каменная плита
    if (!this.has('slab')) {
      const g = this.g();
      g.fillStyle(0x5a6068, 1);
      g.fillRoundedRect(10, 14, 76, 68, 10);
      g.fillStyle(0x8a9098, 1);
      g.fillRoundedRect(10, 14, 76, 40, 10);
      g.lineStyle(3, 0x3c4148, 1);
      g.strokeRoundedRect(10, 14, 76, 68, 10);
      g.fillStyle(0x3c4148, 1);
      g.fillCircle(24, 30, 4);
      g.fillCircle(72, 30, 4);
      g.fillCircle(24, 66, 4);
      g.fillCircle(72, 66, 4);
      g.generateTexture('slab', 96, 96);
      g.destroy();
    }

    // треснувшая плита
    if (!this.has('slab_crack')) {
      const g = this.g();
      g.fillStyle(0x5a6068, 1);
      g.fillRoundedRect(10, 14, 76, 68, 10);
      g.fillStyle(0x8a9098, 1);
      g.fillRoundedRect(10, 14, 76, 40, 10);
      g.lineStyle(3, 0x3c4148, 1);
      g.strokeRoundedRect(10, 14, 76, 68, 10);
      g.lineStyle(3, 0x22262b, 1);
      g.lineBetween(30, 14, 42, 38);
      g.lineBetween(42, 38, 34, 58);
      g.lineBetween(34, 58, 50, 82);
      g.lineBetween(42, 38, 60, 44);
      g.generateTexture('slab_crack', 96, 96);
      g.destroy();
    }

    // лёд
    if (!this.has('ice')) {
      const g = this.g();
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
    }

    // идол
    if (!this.has('idol')) {
      const g = this.g();
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
    }

    // жар-птица
    if (!this.has('bird')) {
      const g = this.g();
      g.fillStyle(0xff5a2a, 1);
      g.fillTriangle(20, 84, 40, 48, 44, 86);
      g.fillStyle(0xffb020, 1);
      g.fillTriangle(34, 88, 46, 56, 56, 88);
      g.fillStyle(0xff7a1a, 1);
      g.fillCircle(50, 42, 20);
      g.fillStyle(0xffd76a, 1);
      g.fillTriangle(36, 40, 62, 24, 66, 52);
      g.fillStyle(0xffb020, 1);
      g.fillCircle(64, 26, 10);
      g.fillStyle(0xfff2c9, 1);
      g.fillTriangle(72, 22, 84, 26, 72, 30);
      g.fillStyle(0x3c1a05, 1);
      g.fillCircle(66, 24, 2.4);
      g.fillStyle(0xff5a2a, 1);
      g.fillTriangle(58, 14, 64, 4, 68, 16);
      g.generateTexture('bird', 96, 96);
      g.destroy();
    }

    // солнечная бомба
    if (!this.has('bomb') && !this.has('megabomb')) {
      const g = this.g();
      g.fillStyle(0xffe493, 0.35);
      g.fillCircle(48, 48, 40);
      g.fillStyle(0xffb020, 1);
      g.fillCircle(48, 48, 26);
      g.fillStyle(0xffd76a, 1);
      g.fillCircle(44, 44, 19);
      g.lineStyle(5, 0xffe493, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(48 + Math.cos(a) * 30, 48 + Math.sin(a) * 30, 48 + Math.cos(a) * 42, 48 + Math.sin(a) * 42);
      }
      g.fillStyle(0x8a5a08, 1);
      g.fillCircle(48, 48, 7);
      g.generateTexture('megabomb', 96, 96);
      g.generateTexture('bomb', 96, 96);
      g.destroy();
    }
  }

  // ---------- Спец-фишки ----------

  private buildSpecials(): void {
    // аура «Огненного жезла» (матч 4 в ряд)
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

    // аура «Ока бога» (матч 5 в ряд)
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
  }

  // ---------- Иконки тотемов ----------

  private buildSkillIcons(): void {
    if (!this.has('skill_red')) {
      const g = this.g();
      g.fillStyle(0xff7a2a, 0.22);
      g.fillCircle(32, 34, 29);
      g.fillStyle(0xff5a4a, 1);
      g.fillTriangle(32, 4, 52, 40, 12, 40);
      g.fillCircle(32, 44, 15);
      g.fillStyle(0xffd23e, 1);
      g.fillTriangle(32, 20, 44, 44, 20, 44);
      g.fillCircle(32, 46, 9);
      g.fillStyle(0xfff0a8, 1);
      g.fillCircle(32, 48, 4);
      g.generateTexture('skill_red', 64, 64);
      g.destroy();
    }
    if (!this.has('skill_blue')) {
      const g = this.g();
      const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
      const bolt: Phaser.Math.Vector2[] = [V(38, 2), V(13, 35), V(27, 35), V(23, 62), V(51, 25), V(35, 25)];
      g.fillStyle(0x4aa8ff, 0.22);
      g.fillCircle(32, 32, 29);
      g.fillStyle(0x7ec8ff, 1);
      g.fillPoints(bolt, true);
      g.lineStyle(3, 0x1c5aa8, 1);
      g.strokePoints(bolt, true);
      g.generateTexture('skill_blue', 64, 64);
      g.destroy();
    }
    if (!this.has('skill_green')) {
      const g = this.g();
      g.fillStyle(0x4ae07a, 0.18);
      g.fillCircle(32, 32, 29);
      g.lineStyle(5, 0x4ae07a, 1);
      g.strokeCircle(30, 32, 18);
      g.lineStyle(4, 0xa8ffc4, 1);
      g.lineBetween(30, 32, 30, 20);
      g.lineBetween(30, 32, 40, 36);
      g.fillStyle(0x4ae07a, 1);
      g.fillRoundedRect(46, 26, 14, 5, 2);
      g.fillRoundedRect(50.5, 21.5, 5, 14, 2);
      g.generateTexture('skill_green', 64, 64);
      g.destroy();
    }
  }

  // ---------- Splash ----------

  private showSplash(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f3320, 0x0f3320, 0x050f0a, 0x050f0a, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);

    // силуэт ступенчатой пирамиды
    const pyr = this.add.graphics();
    pyr.fillStyle(0x123b26, 0.9);
    for (let i = 0; i < 7; i++) {
      const w = 420 - i * 52;
      pyr.fillRect(GAME_W / 2 - w / 2, 690 - i * 44, w, 46);
    }
    pyr.fillStyle(0xf5b52e, 0.9);
    pyr.fillTriangle(GAME_W / 2 - 18, 384, GAME_W / 2 + 18, 384, GAME_W / 2, 352);
    this.tweens.add({ targets: pyr, y: { from: 60, to: 0 }, alpha: { from: 0, to: 1 }, duration: 700, ease: 'Cubic.easeOut' });

    const title = this.add
      .text(GAME_W / 2, 150, 'ЛЕСТНИЦА\nБОГА', {
        fontFamily: '"Russo One"',
        fontSize: '64px',
        color: '#f5b52e',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 8);
    this.tweens.add({ targets: title, scale: { from: 0.6, to: 1 }, alpha: { from: 0, to: 1 }, duration: 600, ease: 'Back.easeOut' });

    this.add
      .text(GAME_W / 2, 268, 'три в ряд · восхождение к богам', {
        fontFamily: '"Rubik"',
        fontSize: '17px',
        color: '#8fd8b4',
      })
      .setOrigin(0.5);

    // ряд кристаллов
    FRUIT_KINDS.forEach((kind, i) => {
      const x = 70 + i * 80;
      const key = `fruit_${kind}`;
      const tex = this.textures.get(key);
      const w =
        tex && tex.key !== '__MISSING'
          ? (tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement)?.width || 96
          : 96;
      const spr = this.add.image(x, 840, key).setScale(50 / w);
      this.tweens.add({
        targets: spr,
        y: 820,
        duration: 900 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    const tap = this.add
      .text(GAME_W / 2, 905, 'НАЖМИ, ЧТОБЫ НАЧАТЬ ВОСХОЖДЕНИЕ', {
        fontFamily: '"Russo One"',
        fontSize: '19px',
        color: '#f9ecc8',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1 });

    const hit = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0).setInteractive();
    hit.once('pointerdown', async () => {
      sfx.unlock();
      sfx.play('star');
      tap.setText('БОГИ ПРОБУЖДАЮТСЯ...');
      const profile = await vk.getUserProfile();
      playerState.applyProfile(profile);
      if (!this.scene.isActive('BootScene')) return;
      this.cameras.main.fadeOut(420, 4, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MapScene');
        this.scene.launch('UIScene');
      });
    });

    // живые светлячки на splash
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        const p = this.add.particles(
          Phaser.Math.Between(20, GAME_W - 20),
          Phaser.Math.Between(300, 860),
          'spark',
          {
            speed: { min: 10, max: 40 },
            angle: { min: 250, max: 290 },
            scale: { start: 0.3, end: 0 },
            lifespan: 1400,
            tint: [0xffd76a, 0x9dffce],
            emitting: false,
          },
        );
        p.explode(1);
        this.time.delayedCall(1500, () => p.destroy());
      },
    });
  }
}
