// ============================================================
// MapScene: мини-карта уровней.
//  - drag/swipe-скролл по вертикали с инерцией + колесо мыши;
//  - узлы: обычные, боссы, сундуки; состояния: пройден / текущий
//    (пульсирует) / заблокирован (замок);
//  - параллакс-фон в отдельном слое (не конфликтует с картой);
//  - тап по уровню → событие UIScene 'openLevel'.
// ============================================================
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  NODE_SPACING,
  getLevels,
  CHESTS,
  CHAPTERS,
  nodePos,
  type LevelDef,
} from '../data/gameData';
import { playerState } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';

const TAU = Math.PI * 2;

export class MapScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private bgFar!: Phaser.GameObjects.Container;
  private bgMid!: Phaser.GameObjects.Container;
  private lowY = 0;
  private highY = 0;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private movedTotal = 0;
  private vel = 0;
  private levelCount = 0;

  constructor() {
    super('MapScene');
  }

  create(): void {
    const levels = getLevels();
    this.levelCount = levels.length;
    this.cameras.main.setBackgroundColor('#0a2113');

    this.buildBackgrounds();
    this.world = this.add.container(0, 0);
    this.buildPath(levels.length);
    this.buildChapterPlates();
    this.buildNodes(levels);
    this.buildChests();
    this.buildAmbient();

    this.lowY = 780; // текущий уровень у нижней трети экрана
    this.highY = 180 + (levels.length - 1) * NODE_SPACING;
    this.world.y = this.lowY;

    // Полноэкранный слой захвата для скролла (под узлами по глубине)
    const hit = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0)
      .setInteractive()
      .setDepth(-10);

    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.movedTotal = 0;
      this.vel = 0;
      this.lastPointerX = p.x;
      this.lastPointerY = p.y;
      this.tweens.killTweensOf(this.world);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const dy = p.y - this.lastPointerY;
      this.movedTotal += Math.abs(p.x - this.lastPointerX) + Math.abs(dy);
      this.lastPointerX = p.x;
      this.lastPointerY = p.y;
      this.world.y = this.clampY(this.world.y + dy);
      this.vel = this.vel * 0.55 + dy * 0.45;
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
    });
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        this.world.y = this.clampY(this.world.y - dy * 0.7);
        this.vel = 0;
      },
    );

    this.events.on('focusLevel', this.onFocusLevel, this);
    this.events.on('refreshChests', this.onRefreshChests, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('focusLevel', this.onFocusLevel, this);
      this.events.off('refreshChests', this.onRefreshChests, this);
    });

    this.cameras.main.fadeIn(350, 6, 20, 12);
    // Плавный подлёт к текущему уровню
    this.time.delayedCall(250, () => this.focusOn(playerState.data.level));
  }

  // ---------------- Фон (отдельный слой) ----------------

  private buildBackgrounds(): void {
    this.bgFar = this.add.container(0, 0).setDepth(-8);
    this.bgMid = this.add.container(0, 0).setDepth(-6);

    const far = this.add.graphics();
    // дальние горы и пирамиды
    for (let y = -800; y < 1500; y += 380) {
      const left = (y / 380) % 2 === 0;
      const baseY = y + 200;
      far.fillStyle(0x0e2c1b, 1);
      far.beginPath();
      far.moveTo(left ? -40 : GAME_W + 40, baseY + 210);
      far.lineTo(left ? -40 : GAME_W + 40, baseY - 40);
      far.lineTo(left ? 300 : GAME_W - 300, baseY + 210);
      far.closePath();
      far.fillPath();
      far.fillStyle(0x10321f, 1);
      far.beginPath();
      far.moveTo(left ? -40 : GAME_W + 40, baseY + 260);
      far.lineTo(left ? -40 : GAME_W + 40, baseY + 60);
      far.lineTo(left ? 200 : GAME_W - 200, baseY + 260);
      far.closePath();
      far.fillPath();
    }
    // силуэты ступенчатых пирамид
    for (let i = 0; i < 3; i++) {
      const cx = i % 2 === 0 ? 120 : GAME_W - 120;
      const baseY = -300 + i * 760;
      far.fillStyle(0x123524, 0.9);
      for (let st = 0; st < 5; st++) {
        const w = 220 - st * 38;
        far.fillRect(cx - w / 2, baseY - st * 26, w, 26);
      }
      far.fillStyle(0xf5b52e, 0.07);
      far.fillCircle(cx, baseY - 160, 90);
    }
    this.bgFar.add(far);

    const mid = this.add.graphics();
    // ацтекские кольца-глифы
    for (let i = 0; i < 5; i++) {
      const cx = i % 2 === 0 ? 60 : GAME_W - 60;
      const cy = -900 + i * 620;
      mid.lineStyle(10, 0xf5b52e, 0.055);
      mid.strokeCircle(cx, cy, 110);
      mid.lineStyle(4, 0xf5b52e, 0.07);
      mid.strokeCircle(cx, cy, 78);
      for (let t = 0; t < 12; t++) {
        const a = (t / 12) * TAU;
        mid.lineBetween(
          cx + Math.cos(a) * 84,
          cy + Math.sin(a) * 84,
          cx + Math.cos(a) * 104,
          cy + Math.sin(a) * 104,
        );
      }
    }
    this.bgMid.add(mid);

    // листва по краям
    for (let y = -1300; y < 2050; y += 210) {
      const leftSide = Math.sin(y * 12.9898) > 0;
      const leaf = this.add
        .image(leftSide ? 24 + Math.abs(Math.sin(y)) * 40 : GAME_W - 24 - Math.abs(Math.cos(y)) * 40, y, 'leaf')
        .setScale(0.7 + Math.abs(Math.sin(y * 3.7)) * 0.8)
        .setAngle(leftSide ? 100 + Math.sin(y) * 40 : -100 + Math.cos(y) * 40)
        .setAlpha(0.85);
      this.bgMid.add(leaf);
    }
  }

  private buildAmbient(): void {
    // светлячки (экранный слой, не зависит от скролла)
    this.add
      .particles(0, 0, 'spark', {
        x: { min: 0, max: GAME_W },
        y: { min: 0, max: GAME_H },
        lifespan: 4600,
        speed: { min: 4, max: 18 },
        angle: { min: 245, max: 295 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 0.5, end: 0 },
        tint: [0xffe28a, 0x9dffce],
        frequency: 300,
        blendMode: 'ADD',
      })
      .setDepth(60);
    this.add.image(GAME_W / 2, GAME_H / 2, 'vignette').setDepth(70).setAlpha(0.85);
  }

  // ---------------- Путь и узлы ----------------

  private buildPath(count: number): void {
    const pts: Phaser.Math.Vector2[] = [];
    pts.push(new Phaser.Math.Vector2(GAME_W / 2, 160));
    for (let i = 0; i < count; i++) {
      const np = nodePos(i);
      pts.push(new Phaser.Math.Vector2(np.x, np.y));
    }
    const top = nodePos(count - 1);
    pts.push(new Phaser.Math.Vector2(top.x, top.y - 160));

    const curve = new Phaser.Curves.Spline(pts);
    const samples = curve.getPoints(14);

    const g = this.add.graphics();
    g.lineStyle(13, 0x113523, 1);
    for (let i = 1; i < samples.length; i++) {
      g.lineBetween(samples[i - 1].x, samples[i - 1].y, samples[i].x, samples[i].y);
    }
    g.lineStyle(5, 0xe9b83f, 0.85);
    for (let i = 1; i < samples.length; i++) {
      if (Math.floor(i / 6) % 2 === 0) {
        g.lineBetween(samples[i - 1].x, samples[i - 1].y, samples[i].x, samples[i].y);
      }
    }
    this.world.add(g);
  }

  private buildChapterPlates(): void {
    CHAPTERS.forEach((ch) => {
      const idx = ch.from - 1;
      const p = nodePos(idx);
      const c = this.add.container(p.x, p.y + 84);
      const g = this.add.graphics();
      g.fillStyle(0x06180f, 0.92);
      g.fillRoundedRect(-140, -30, 280, 60, 12);
      g.lineStyle(2.5, 0xd9a52f, 0.9);
      g.strokeRoundedRect(-140, -30, 280, 60, 12);
      g.lineStyle(2, 0xd9a52f, 0.5);
      g.lineBetween(-190, 0, -146, 0);
      g.lineBetween(146, 0, 190, 0);
      const title = this.add
        .text(0, -8, ch.title, { fontFamily: '"Russo One"', fontSize: '21px', color: '#f5b52e' })
        .setOrigin(0.5);
      const num = this.add
        .text(0, 14, ch.num, { fontFamily: '"Rubik"', fontSize: '12px', color: '#b9ad87' })
        .setOrigin(0.5);
      const glowL = this.add.image(-146, 0, 'glow').setScale(0.5).setTint(0xf5b52e).setAlpha(0.6);
      const glowR = this.add.image(146, 0, 'glow').setScale(0.5).setTint(0xf5b52e).setAlpha(0.6);
      c.add([g, glowL, glowR, title, num]);
      this.world.add(c);
    });
  }

  private buildNodes(levels: LevelDef[]): void {
    const cur = playerState.data.level;

    levels.forEach((def) => {
      const i = def.id - 1;
      const p = nodePos(i);
      const state: 'done' | 'current' | 'locked' =
        def.id < cur ? 'done' : def.id === cur ? 'current' : 'locked';
      const boss = def.type === 'boss';
      const c = this.add.container(p.x, p.y);

      // свечение
      const glow = this.add.image(0, 0, 'glow');
      if (state === 'current') {
        glow.setTint(0xffd76a).setAlpha(0.8).setScale(1.15);
        this.tweens.add({
          targets: glow,
          scale: { from: 1.0, to: 1.35 },
          alpha: { from: 0.55, to: 0.95 },
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (state === 'done') {
        glow.setTint(0x2ee6a8).setAlpha(0.35);
      } else {
        glow.setTint(0x5a6a60).setAlpha(0.12);
      }

      // основание
      const base = this.add.graphics();
      const r = boss ? 40 : 34;
      if (state === 'current') {
        base.fillGradientStyle(0xffd76a, 0xffd76a, 0xf0a51c, 0xf0a51c, 1);
        base.fillCircle(0, 0, r);
        base.lineStyle(4, 0x8a5a08, 1);
        base.strokeCircle(0, 0, r - 1);
        base.fillStyle(0xffffff, 0.25);
        base.fillEllipse(0, -r * 0.42, r * 1.3, r * 0.6);
      } else if (state === 'done') {
        base.fillStyle(boss ? 0x3c2a10 : 0x1f5d3b, 1);
        base.fillCircle(0, 0, r);
        base.lineStyle(boss ? 4 : 3.5, boss ? 0xf5b52e : 0xf5b52e, 1);
        base.strokeCircle(0, 0, r - 1);
      } else {
        base.fillStyle(boss ? 0x33201a : 0x26332b, 1);
        base.fillCircle(0, 0, r);
        base.lineStyle(3, boss ? 0x6b4a3a : 0x47584d, 1);
        base.strokeCircle(0, 0, r - 1);
      }

      // иконка
      if (state === 'locked') {
        const lock = this.add.image(0, 0, 'lock').setScale(boss ? 1 : 0.9);
        c.add([glow, base, lock]);
      } else if (boss) {
        const skull = this.add
          .image(0, 0, 'skull')
          .setScale(0.95)
          .setTint(state === 'current' ? 0x3c1010 : 0xf2ead6);
        c.add([glow, base, skull]);
      } else {
        const num = this.add
          .text(0, 1, String(def.id), {
            fontFamily: '"Russo One"',
            fontSize: state === 'current' ? '26px' : '23px',
            color: state === 'current' ? '#241a05' : '#f9ecc8',
          })
          .setOrigin(0.5);
        c.add([glow, base, num]);
      }

      // звёзды под пройденным
      if (state === 'done') {
        const got = playerState.starsOf(def.id);
        for (let sIdx = 0; sIdx < 3; sIdx++) {
          const st = this.add
            .image((sIdx - 1) * 20, r + 18, 'star')
            .setScale(0.34)
            .setTint(sIdx < got ? 0xffd76a : 0x33413a)
            .setAlpha(sIdx < got ? 1 : 0.8);
          c.add(st);
        }
      }

      // кольцо и стрелка текущего уровня
      if (state === 'current') {
        const ring = this.add.image(0, 0, 'nodeRing').setScale((r + 22) / 56);
        this.tweens.add({ targets: ring, angle: 360, duration: 7000, repeat: -1 });
        const arrow = this.add.image(0, -r - 34, 'arrow');
        this.tweens.add({
          targets: arrow,
          y: -r - 24,
          duration: 550,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        c.add([ring, arrow]);
      }

      // подпись босса
      if (boss && def.bossName) {
        const label = this.add
          .text(0, r + 22, def.bossName.toUpperCase(), {
            fontFamily: '"Russo One"',
            fontSize: '12px',
            color: state === 'locked' ? '#71806f' : '#ff8a76',
          })
          .setOrigin(0.5);
        c.add(label);
      }

      // интерактив
      const hit = this.add.circle(0, 0, r + 14, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (this.movedTotal > 14) return; // это был скролл
        if (state === 'locked') {
          sfx.play('invalid');
          sfx.vibrate('medium');
          this.tweens.add({
            targets: c,
            x: { from: c.x - 7, to: c.x },
            duration: 70,
            yoyo: true,
            repeat: 3,
          });
          this.scene.get('UIScene')?.events.emit('toast', 'Уровень заблокирован — пройди предыдущий');
          return;
        }
        sfx.play('tap');
        this.scene.get('UIScene')?.events.emit('openLevel', def);
      });
      c.add(hit);

      this.world.add(c);
    });
  }

  private chestLayer!: Phaser.GameObjects.Container;

  private onRefreshChests(): void {
    this.chestLayer.removeAll(true);
    this.buildChests();
  }

  private buildChests(): void {
    if (!this.chestLayer) {
      this.chestLayer = this.add.container(0, 0);
      this.world.add(this.chestLayer);
    }
    const cur = playerState.data.level;
    CHESTS.forEach((chest) => {
      const p = nodePos(chest.afterLevel - 0.5);
      const claimed = playerState.chestClaimed(chest.id);
      const claimable = cur > chest.afterLevel && !claimed;
      const c = this.add.container(p.x, p.y);

      if (claimable) {
        const glow = this.add.image(0, 0, 'glow').setTint(0xffd76a).setAlpha(0.75).setScale(0.9);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.4, to: 0.9 },
          scale: { from: 0.8, to: 1.05 },
          duration: 700,
          yoyo: true,
          repeat: -1,
        });
        c.add(glow);
      }

      const spr = this.add.image(0, 0, 'chest').setScale(0.85);
      if (claimed) spr.setTint(0x77877c).setAlpha(0.6);
      else if (!claimable) spr.setTint(0x5f6f66).setAlpha(0.75);
      c.add(spr);

      if (!claimable && !claimed) {
        c.add(this.add.image(18, -18, 'lock').setScale(0.55));
      }
      if (claimed) {
        c.add(
          this.add.text(0, 0, '✓', { fontFamily: '"Rubik"', fontSize: '30px', color: '#9dffce' }).setOrigin(0.5),
        );
      }

      const label = this.add
        .text(0, 48, chest.label, {
          fontFamily: '"Rubik"',
          fontSize: '12px',
          color: claimable ? '#f9ecc8' : '#71806f',
          fontStyle: claimable ? 'bold' : undefined,
        })
        .setOrigin(0.5);
      c.add(label);

      if (claimable) {
        const hit = this.add.circle(0, 0, 44, 0x000000, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          if (this.movedTotal > 14) return;
          sfx.play('chest');
          this.scene.get('UIScene')?.events.emit('openChest', chest);
        });
        c.add(hit);
      }

      this.chestLayer.add(c);
    });
  }

  // ---------------- Скролл ----------------

  private clampY(y: number): number {
    return Phaser.Math.Clamp(y, this.lowY, this.highY);
  }

  private onFocusLevel(levelId: number): void {
    this.focusOn(levelId);
  }

  private focusOn(levelId: number): void {
    const idx = Phaser.Math.Clamp(levelId - 1, 0, this.levelCount - 1);
    const target = this.clampY(560 + idx * NODE_SPACING);
    this.tweens.killTweensOf(this.world);
    this.tweens.add({
      targets: this.world,
      y: target,
      duration: 750,
      ease: 'Cubic.easeOut',
    });
  }

  update(_time: number, delta: number): void {
    if (!this.dragging && Math.abs(this.vel) > 0.2) {
      this.world.y = this.clampY(this.world.y + this.vel * (delta / 16.7));
      this.vel *= Math.pow(0.93, delta / 16.7);
    } else if (!this.dragging) {
      this.vel = 0;
    }
    const d = this.world.y - this.lowY;
    this.bgFar.y = -d * 0.12;
    this.bgMid.y = -d * 0.3;
  }
}
