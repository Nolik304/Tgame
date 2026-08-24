// ============================================================
// GameScene: ядро match-3 «Лестница Бога».
//  - поле 7×8, 6 видов фруктов (твои спрайты из public/fruits/
//    или процедурный фолбэк);
//  - свайп или тап-тап для обмена, только валидные ходы;
//  - каскады, комбо-множитель, бонусы за 4/5 в ряд;
//  - БОЕВЫЕ НАВЫКИ (аналог тотемов): заряжаются собранными
//    фруктами своего вида; Огонь богов — взрыв 3×3,
//    Небесная молния — крест, Дух ветра — шторм по виду;
//  - цели: очки или сбор фруктов; боссы с полосой HP;
//  - звёзды, награды (x2 при активном бусте), жизни;
//  - пауза, победа/поражение, подсказка, перемешивание.
// ============================================================
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  FRUIT_KINDS,
  FRUIT_COLORS,
  FRUIT_NAMES,
  SKILLS,
  getLevels,
  getEventStage,
  EVENT_STAGES,
  EVENT_NAME,
  type LevelDef,
  type FruitKind,
  type SkillDef,
} from '../data/gameData';
import { playerState } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';
import { vk } from '../services/VKBridgeService';
import { Popup, makeButton, roundedRectPath, fmtNum, fmtTime } from '../ui/Modal';

const COLS = 7;
const ROWS = 8;
const CELL = 64;
const BOARD_X = (GAME_W - COLS * CELL) / 2; // 48
const BOARD_Y = 268;
const RUBIK = '"Rubik"';
const RUSSO = '"Russo One"';

type SpecialType = 'torch' | 'eye';

interface FruitObj {
  kind: FruitKind;
  sprite: Phaser.GameObjects.Image;
  baseScale: number; // нормализованный масштаб под реальный размер PNG
  aura?: Phaser.GameObjects.Image;
  special?: SpecialType;
  frozen?: Phaser.GameObjects.Image; // лёд босса
  r: number;
  c: number;
}
interface ObstacleObj {
  type: 'vine' | 'slab';
  r: number;
  c: number;
  hp: number;
  sprite: Phaser.GameObjects.Image;
}
interface IdolObj {
  r: number;
  c: number;
  sprite: Phaser.GameObjects.Image;
}

interface SpawnDef {
  r: number;
  c: number;
  kind: FruitKind;
  type: SpecialType;
}

interface Wave {
  removed: Set<string>;
  spawns: SpawnDef[];
  detonations: number;
}
interface CellPos {
  r: number;
  c: number;
}
interface MatchGroup {
  kind: FruitKind;
  cells: CellPos[];
}
interface SkillButton {
  def: SkillDef;
  x: number;
  y: number;
  icon: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  pulse?: Phaser.Tweens.Tween;
}

export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private grid: (FruitObj | null)[][] = [];
  private board!: Phaser.GameObjects.Container;
  private objLayer!: Phaser.GameObjects.Container;
  private moves = 0;
  private score = 0;
  private collected = 0;
  private locked = true;
  private overlayOpen = true;
  private selected: FruitObj | null = null;
  private ring!: Phaser.GameObjects.Image;
  private downFruit: FruitObj | null = null;
  private downX = 0;
  private downY = 0;
  private dragged = false;
  private hintTimer?: Phaser.Time.TimerEvent;
  private lifeLost = false;
  private isEvent = false;
  private eventStageN = 0;

  // препятствия и идолы
  private obstacles: ObstacleObj[] = [];
  private idols: IdolObj[] = [];

  // навыки
  private skillCharge: Record<string, number> = {};
  private skillButtons: SkillButton[] = [];
  private aimSkill: SkillDef | null = null;
  private aimRing?: Phaser.GameObjects.Image;
  private aimBanner?: Phaser.GameObjects.Text;

  // HUD
  private movesText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private barFill!: Phaser.GameObjects.Graphics;
  private bossBar?: Phaser.GameObjects.Graphics;
  private bossSprite?: Phaser.GameObjects.Image;
  private bossMax = 1;

  constructor() {
    super('GameScene');
  }

  create(data?: { levelId?: number; eventStage?: number }): void {
    this.isEvent = !!data?.eventStage;
    this.eventStageN = data?.eventStage ?? 0;
    if (this.isEvent) {
      const ev = getEventStage(this.eventStageN);
      this.level = {
        id: 900 + this.eventStageN,
        type: 'normal',
        name: `Ступень ${this.eventStageN}`,
        moves: ev.moves,
        goal: ev.goal,
        parScore: 1500 + this.eventStageN * 120,
        rewardCoins: ev.rewardCoins,
        rewardGems: ev.rewardGems,
      };
    } else {
      const id = Phaser.Math.Clamp(data?.levelId ?? playerState.data.level, 1, 24);
      this.level = getLevels().find((l) => l.id === id)!;
    }
    this.moves = this.level.moves;
    this.score = 0;
    this.collected = 0;
    this.locked = true;
    this.overlayOpen = true;
    this.selected = null;
    this.downFruit = null;
    this.lifeLost = false;
    this.skillCharge = {};
    SKILLS.forEach((s) => (this.skillCharge[s.id] = 0));
    this.skillButtons = [];
    this.aimSkill = null;
    this.obstacles = [];
    this.idols = [];
    this.bossMax = this.level.goal.type === 'collect' ? this.level.goal.amount : 1;

    this.buildBackground();
    this.buildHUD();
    this.board = this.add.container(0, 0).setDepth(10);
    this.objLayer = this.add.container(0, 0).setDepth(11);
    this.ring = this.add.image(0, 0, 'ring').setDepth(12).setVisible(false);
    this.genBoard();
    this.placeLayout();
    this.buildInput();
    this.showStartOverlay();

    this.scene.get('UIScene')?.events.emit('hud', false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hintTimer?.destroy();
      this.scene.get('UIScene')?.events.emit('hud', true);
    });
  }

  // ---------------- Фон и HUD ----------------

  private buildBackground(): void {
    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x0f3320, 0x0f3320, 0x061410, 0x061410, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.fillStyle(0xf5b52e, 0.05);
    bg.fillCircle(GAME_W / 2, 140, 240);
    bg.fillStyle(0x0c2818, 1);
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 120;
      bg.beginPath();
      bg.moveTo(x - 70, GAME_H);
      bg.lineTo(x, GAME_H - 130 - (i % 2) * 60);
      bg.lineTo(x + 70, GAME_H);
      bg.closePath();
      bg.fillPath();
    }
    const panel = this.add.graphics().setDepth(1);
    const pw = COLS * CELL + 22;
    const ph = ROWS * CELL + 22;
    panel.fillStyle(0x050f0a, 0.72);
    roundedRectPath(panel, BOARD_X - 11, BOARD_Y - 11, pw, ph, 16);
    panel.fillPath();
    panel.lineStyle(3, 0xd9a52f, 0.85);
    roundedRectPath(panel, BOARD_X - 11, BOARD_Y - 11, pw, ph, 16);
    panel.strokePath();
    panel.lineStyle(1.5, 0xf5d78a, 0.18);
    roundedRectPath(panel, BOARD_X - 5, BOARD_Y - 5, pw - 12, ph - 12, 12);
    panel.strokePath();
    panel.lineStyle(1, 0x1d4a2e, 0.5);
    for (let r = 1; r < ROWS; r++) panel.lineBetween(BOARD_X, BOARD_Y + r * CELL, BOARD_X + COLS * CELL, BOARD_Y + r * CELL);
    for (let c = 1; c < COLS; c++) panel.lineBetween(BOARD_X + c * CELL, BOARD_Y, BOARD_X + c * CELL, BOARD_Y + ROWS * CELL);
    this.add.image(GAME_W / 2, GAME_H / 2, 'vignette').setDepth(5).setAlpha(0.7);
  }

  private buildHUD(): void {
    const hud = this.add.container(0, 0).setDepth(30);

    // пауза
    const pause = this.add.container(40, 44);
    const pg = this.add.graphics();
    pg.fillStyle(0x123626, 1);
    pg.fillCircle(0, 0, 26);
    pg.lineStyle(3, 0xf5b52e, 0.9);
    pg.strokeCircle(0, 0, 25);
    pg.fillStyle(0xf9ecc8, 1);
    pg.fillRoundedRect(-9, -10, 7, 20, 3);
    pg.fillRoundedRect(2, -10, 7, 20, 3);
    const ph2 = this.add.circle(0, 0, 30, 0x000000, 0).setInteractive({ useHandCursor: true });
    ph2.on('pointerup', () => {
      sfx.play('click');
      this.openPause();
    });
    pause.add([pg, ph2]);
    hud.add(pause);

    hud.add(
      this.add.text(GAME_W / 2, 26, `СТУПЕНЬ ${this.level.id}`, {
        fontFamily: RUSSO, fontSize: '19px', color: '#f5b52e',
      }).setOrigin(0.5),
    );
    hud.add(
      this.add.text(GAME_W / 2, 50, this.level.name, {
        fontFamily: RUBIK, fontSize: '13px', color: '#b9ad87',
      }).setOrigin(0.5),
    );

    // ходы
    const movesBox = this.add.graphics();
    movesBox.fillStyle(0x08190f, 0.9);
    roundedRectPath(movesBox, GAME_W - 118, 14, 100, 62, 12);
    movesBox.fillPath();
    movesBox.lineStyle(2.5, this.level.type === 'boss' ? 0xff5a5a : 0xd9a52f, 0.9);
    roundedRectPath(movesBox, GAME_W - 118, 14, 100, 62, 12);
    movesBox.strokePath();
    hud.add(movesBox);
    hud.add(
      this.add.text(GAME_W - 68, 30, 'ХОДЫ', {
        fontFamily: RUBIK, fontSize: '11px', color: '#8fd8b4',
      }).setOrigin(0.5),
    );
    this.movesText = this.add.text(GAME_W - 68, 54, String(this.moves), {
      fontFamily: RUSSO, fontSize: '27px', color: '#f9ecc8',
    }).setOrigin(0.5);
    hud.add(this.movesText);

    // очки
    hud.add(this.add.text(26, 88, 'ОЧКИ', { fontFamily: RUBIK, fontSize: '11px', color: '#8fd8b4' }));
    this.scoreText = this.add.text(26, 104, '0', { fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8' });
    hud.add(this.scoreText);

    // цель
    const goalBox = this.add.graphics();
    goalBox.fillStyle(0x08190f, 0.9);
    roundedRectPath(goalBox, 268, 84, 246, 44, 12);
    goalBox.fillPath();
    goalBox.lineStyle(2, 0x2c5a40, 1);
    roundedRectPath(goalBox, 268, 84, 246, 44, 12);
    goalBox.strokePath();
    hud.add(goalBox);
    if (this.level.goal.type === 'collect') {
      hud.add(
        this.add
          .image(296, 106, `fruit_${this.level.goal.kind}`)
          .setScale(this.fitScale(`fruit_${this.level.goal.kind}`, 30)),
      );
    } else if (this.level.goal.type === 'relic') {
      hud.add(this.add.image(296, 106, 'idol').setScale(0.34));
    } else {
      hud.add(this.add.image(296, 106, 'star').setScale(0.5).setTint(0xf5b52e));
    }
    this.goalText = this.add.text(394, 107, '', { fontFamily: RUSSO, fontSize: '17px', color: '#f9ecc8' }).setOrigin(0.5);
    hud.add(this.goalText);

    // полоса звёзд
    const barY = 142;
    const bar = this.add.graphics();
    bar.fillStyle(0x08190f, 1);
    roundedRectPath(bar, BOARD_X, barY, COLS * CELL, 10, 5);
    bar.fillPath();
    hud.add(bar);
    this.barFill = this.add.graphics().setDepth(31);
    const threeAt = this.level.parScore * 2.2;
    [this.level.parScore * 1.5, threeAt].forEach((thr) => {
      const x = BOARD_X + Math.min(1, thr / threeAt) * COLS * CELL;
      hud.add(this.add.image(x, barY + 5, 'star').setScale(0.32).setTint(0x8a6a20));
    });
    hud.add(this.add.image(BOARD_X + COLS * CELL, barY + 5, 'star').setScale(0.4).setTint(0x8a6a20));

    // босс
    if (this.level.type === 'boss' && this.level.goal.type === 'collect') {
      const by = 196;
      this.bossSprite = this.add.image(66, by, 'skull').setScale(1.05).setDepth(31);
      hud.add(this.bossSprite);
      hud.add(
        this.add.text(104, by - 18, (this.level.bossName ?? 'БОСС').toUpperCase(), {
          fontFamily: RUSSO, fontSize: '14px', color: '#ff8a76',
        }),
      );
      const bb = this.add.graphics();
      bb.fillStyle(0x08190f, 1);
      roundedRectPath(bb, 104, by + 2, 388, 13, 6);
      bb.fillPath();
      hud.add(bb);
      this.bossBar = this.add.graphics().setDepth(31);
      this.drawBossBar();
    }

    hud.add(
      this.add.text(GAME_W / 2, 806, 'Меняй кристаллы местами — собирай 3 в ряд', {
        fontFamily: RUBIK, fontSize: '13px', color: '#71806f',
      }).setOrigin(0.5),
    );

    this.buildSkillHUD(hud);
    this.updateHUD();
  }

  // ---------------- Боевые навыки ----------------

  private buildSkillHUD(hud: Phaser.GameObjects.Container): void {
    const baseY = 878;
    SKILLS.forEach((def, i) => {
      const x = GAME_W / 2 + (i - 1) * 118;
      const y = baseY;

      const glow = this.add.image(x, y, 'glow').setTint(0xffd76a).setScale(1.05).setAlpha(0).setDepth(29);
      const bg = this.add.graphics().setDepth(30);
      bg.fillStyle(0x0b2417, 1);
      bg.fillCircle(x, y, 36);
      bg.lineStyle(3, 0x2c5a40, 1);
      bg.strokeCircle(x, y, 35);

      const icon = this.add.image(x, y, def.icon).setScale(0.72).setDepth(31).setAlpha(0.9);
      const ring = this.add.graphics().setDepth(32).setPosition(x, y);
      const count = this.add.text(x, y + 50, `0/${def.charge}`, {
        fontFamily: RUSSO, fontSize: '12px', color: '#9db39a',
      }).setOrigin(0.5).setDepth(32);

      const hit = this.add.circle(x, y, 40, 0x000000, 0).setInteractive({ useHandCursor: true }).setDepth(33);
      hit.on('pointerup', () => this.onSkillTap(def));
      hit.on('pointerover', () => icon.setScale(0.8));
      hit.on('pointerout', () => icon.setScale(0.72));

      hud.add([glow, bg, icon, ring, count]);
      this.skillButtons.push({ def, x, y, icon, ring, glow, count });
    });
    hud.add(
      this.add.text(GAME_W / 2, 944, 'Боевые навыки заряжаются кристаллами своего вида', {
        fontFamily: RUBIK, fontSize: '11px', color: '#5f7a66',
      }).setOrigin(0.5),
    );
  }

  private chargeSkill(kind: FruitKind, n: number): void {
    const def = SKILLS.find((s) => s.kind === kind);
    if (!def) return;
    const cur = this.skillCharge[def.id] ?? 0;
    if (cur >= def.charge) return;
    const next = Math.min(def.charge, cur + n);
    this.skillCharge[def.id] = next;
    this.updateSkillHUD();
    if (next >= def.charge) {
      const btn = this.skillButtons.find((b) => b.def.id === def.id);
      if (btn) {
        sfx.play('boost');
        sfx.vibrate('medium');
        this.floatText(btn.x, btn.y - 60, 'НАВЫК ГОТОВ!', '#ffd76a', 16);
        if (!btn.pulse) {
          btn.pulse = this.tweens.add({
            targets: btn.icon,
            scale: { from: 0.72, to: 0.84 },
            duration: 420,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
    }
  }

  private updateSkillHUD(): void {
    for (const btn of this.skillButtons) {
      const ch = this.skillCharge[btn.def.id] ?? 0;
      const frac = Math.min(1, ch / btn.def.charge);
      const full = frac >= 1;
      btn.ring.clear();
      if (frac > 0.02) {
        btn.ring.lineStyle(5, full ? 0xffd76a : FRUIT_COLORS[btn.def.kind].main, full ? 1 : 0.85);
        btn.ring.beginPath();
        btn.ring.arc(0, 0, 40, -90, -90 + 360 * frac);
        btn.ring.strokePath();
      }
      btn.glow.setAlpha(full ? 0.85 : 0);
      btn.count.setText(full ? 'ЖМИ!' : `${ch}/${btn.def.charge}`);
      btn.count.setColor(full ? '#ffd76a' : '#9db39a');
    }
  }

  private onSkillTap(def: SkillDef): void {
    if (this.overlayOpen) return;
    if (this.aimSkill?.id === def.id) {
      this.cancelAim();
      return;
    }
    const ch = this.skillCharge[def.id] ?? 0;
    if (ch < def.charge || this.locked) {
      sfx.play('invalid');
      const btn = this.skillButtons.find((b) => b.def.id === def.id);
      if (btn) {
        this.floatText(btn.x, btn.y - 58, `Собирай: ${FRUIT_NAMES[def.kind]}`, '#ff9a86', 13);
        this.tweens.add({ targets: btn.icon, x: '-=5', duration: 45, yoyo: true, repeat: 3 });
      }
      return;
    }
    if (def.effect === 'storm') {
      void this.activateSkill(def, null);
    } else {
      this.enterAim(def);
    }
  }

  private enterAim(def: SkillDef): void {
    this.aimSkill = def;
    sfx.play('tap');
    if (!this.aimBanner) {
      this.aimBanner = this.add.text(GAME_W / 2, 226, '', {
        fontFamily: RUSSO, fontSize: '18px', color: '#9dffce',
        stroke: '#06281a', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(45);
    }
    this.aimBanner.setText(`${def.name}: выбери цель!`).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.aimBanner);
    this.tweens.add({ targets: this.aimBanner, alpha: { from: 1, to: 0.55 }, duration: 380, yoyo: true, repeat: -1 });
    if (!this.aimRing) {
      this.aimRing = this.add.image(GAME_W / 2, BOARD_Y + 4 * CELL, 'ring').setScale(0.75).setTint(0x9dffce).setDepth(15);
    }
    this.aimRing.setVisible(true);
  }

  private cancelAim(): void {
    this.aimSkill = null;
    this.aimBanner?.setVisible(false);
    this.aimRing?.setVisible(false);
  }

  private async activateSkill(def: SkillDef, target: CellPos | null): Promise<void> {
    if (this.locked) return;
    this.locked = true;
    this.cancelAim();
    this.resetHintTimer();
    this.skillCharge[def.id] = 0;
    this.updateSkillHUD();
    const btn = this.skillButtons.find((b) => b.def.id === def.id);
    if (btn?.pulse) {
      btn.pulse.stop();
      btn.pulse = undefined;
      btn.icon.setScale(0.72);
    }
    sfx.play('boost');
    sfx.vibrate('heavy');
    this.cameras.main.flash(220, 255, 240, 180);
    this.cameras.main.shake(240, 0.007);

    const cells: CellPos[] = [];
    if (def.effect === 'blast' && target) {
      for (let r = target.r - 1; r <= target.r + 1; r++) {
        for (let c = target.c - 1; c <= target.c + 1; c++) {
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
            if (this.grid[r][c]) cells.push({ r, c });
            this.damageObstacle(r, c, 2);
          }
        }
      }
      const p = this.gemXY(target.r, target.c);
      this.floatText(p.x, p.y - 20, 'ОГОНЬ БОГОВ!', '#ffb35a', 22);
    } else if (def.effect === 'cross' && target) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[target.r][c]) cells.push({ r: target.r, c });
        this.damageObstacle(target.r, c, 2);
      }
      for (let r = 0; r < ROWS; r++) {
        if (r !== target.r) {
          if (this.grid[r][target.c]) cells.push({ r, c: target.c });
          this.damageObstacle(r, target.c, 2);
        }
      }
      const p = this.gemXY(target.r, target.c);
      this.floatText(p.x, p.y - 20, 'НЕБЕСНАЯ МОЛНИЯ!', '#ffe24a', 22);
    } else if (def.effect === 'storm') {
      const counts = new Map<FruitKind, number>();
      this.grid.flat().forEach((f) => {
        if (f) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
      });
      let best: FruitKind = FRUIT_KINDS[0];
      let bn = -1;
      counts.forEach((n, k) => {
        if (n > bn) {
          bn = n;
          best = k;
        }
      });
      this.grid.forEach((row, r) =>
        row.forEach((f, c) => {
          if (f && f.kind === best) cells.push({ r, c });
        }),
      );
      this.floatText(GAME_W / 2, 430, 'ДУХ ВЕТРА!', '#9dffce', 26);
    }

    let gained = 0;
    for (const { r, c } of cells) {
      const fruit = this.grid[r][c];
      if (!fruit) continue;
      this.grid[r][c] = null;
      gained += 25;
      if (this.level.goal.type === 'collect' && this.level.goal.kind === fruit.kind) {
        this.collected++;
        this.bumpBoss();
      }
      const { x, y } = this.gemXY(r, c);
      const em = this.add.particles(x, y, 'spark', {
        speed: { min: 80, max: 300 },
        scale: { start: 0.5, end: 0 },
        lifespan: 420,
        tint: FRUIT_COLORS[fruit.kind].light,
        gravityY: 160,
        emitting: false,
      }).setDepth(20);
      em.explode(6);
      this.time.delayedCall(650, () => em.destroy());
      if (fruit.frozen) fruit.frozen.destroy();
      if (fruit.aura) fruit.aura.destroy();
      this.tweens.add({
        targets: fruit.sprite,
        scale: 0.9,
        alpha: 0,
        angle: def.effect === 'storm' ? 360 : 0,
        duration: 160,
        ease: 'Quad.easeIn',
        onComplete: () => fruit.sprite.destroy(),
      });
    }
    this.score += gained;
    if (gained) this.floatText(GAME_W / 2, 500, `+${gained}`, '#ffd76a', 18);
    this.updateHUD();
    await this.sleep(210);
    if (!this.scene.isActive('GameScene')) return;
    await this.collapse();
    await this.cascadeLoop();
    await this.finishTurn();
  }

  private bumpBoss(): void {
    if (this.level.type === 'boss' && this.bossSprite) {
      this.tweens.add({
        targets: this.bossSprite,
        x: { from: 60, to: 66 },
        duration: 55,
        yoyo: true,
        repeat: 1,
      });
    }
  }

  private drawBossBar(): void {
    if (!this.bossBar) return;
    this.bossBar.clear();
    const frac = Phaser.Math.Clamp(1 - this.collected / this.bossMax, 0, 1);
    if (frac > 0) {
      this.bossBar.fillGradientStyle(0xff8a76, 0xff8a76, 0xd9382e, 0xd9382e, 1);
      roundedRectPath(this.bossBar, 104, 198, Math.max(13, 388 * frac), 13, 6);
      this.bossBar.fillPath();
    }
  }

  private updateHUD(): void {
    this.movesText.setText(String(this.moves));
    this.movesText.setColor(this.moves <= 5 ? '#ff6a5a' : '#f9ecc8');
    this.scoreText.setText(fmtNum(this.score));
    const g = this.level.goal;
    if (g.type === 'collect' || g.type === 'relic') {
      this.goalText.setText(`${Math.min(this.collected, g.amount)} / ${g.amount}`);
    } else {
      this.goalText.setText(`${fmtNum(this.score)} / ${fmtNum(g.amount)}`);
    }
    this.barFill.clear();
    const threeAt = this.level.parScore * 2.2;
    const frac = Math.min(1, this.score / threeAt);
    if (frac > 0.01) {
      this.barFill.fillGradientStyle(0xffd76a, 0xffd76a, 0xee9d12, 0xee9d12, 1);
      roundedRectPath(this.barFill, BOARD_X, 142, COLS * CELL * frac, 10, 5);
      this.barFill.fillPath();
    }
    this.drawBossBar();
  }

  // ---------------- Поле ----------------

  private gemXY(r: number, c: number): { x: number; y: number } {
    return { x: BOARD_X + c * CELL + CELL / 2, y: BOARD_Y + r * CELL + CELL / 2 };
  }

  /**
   * Масштаб, приводящий спрайт любого исходного размера к нужной высоте.
   * Твои PNG могут быть 64, 256 или 512 px — на поле они всегда будут
   * одинакового «игрового» размера, а не огромными квадратами.
   */
  private fitScale(key: string, targetPx: number): number {
    const tex = this.textures.get(key);
    if (!tex || tex.key === '__MISSING') return targetPx / 96;
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const w = src?.width || 96;
    return targetPx / w;
  }

  private randomKind(): FruitKind {
    return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
  }

  /** Сгенерировать поле без стартовых совпадений и с доступным ходом. */
  private genBoard(): void {
    let kinds: FruitKind[][] = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      kinds = [];
      for (let r = 0; r < ROWS; r++) {
        const row: FruitKind[] = [];
        for (let c = 0; c < COLS; c++) {
          let k = this.randomKind();
          let guard = 0;
          while (
            ((c >= 2 && row[c - 1] === k && row[c - 2] === k) ||
              (r >= 2 && kinds[r - 1][c] === k && kinds[r - 2][c] === k)) &&
            guard++ < 30
          ) {
            k = this.randomKind();
          }
          row.push(k);
        }
        kinds.push(row);
      }
      if (this.kindGridHasMove(kinds)) break;
    }
    this.board.removeAll(true);
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row: (FruitObj | null)[] = [];
      for (let c = 0; c < COLS; c++) {
        const kind = kinds[r][c];
        const { x, y } = this.gemXY(r, c);
        const baseScale = this.fitScale(`fruit_${kind}`, 56);
        const sprite = this.add
          .image(x, y - 600 - Math.random() * 240, `fruit_${kind}`)
          .setScale(baseScale);
        this.board.add(sprite);
        row.push({ kind, sprite, baseScale, r, c });
      }
      this.grid.push(row);
    }
    // клетки под препятствиями/идолами остаются пустыми (и при перемешивании)
    for (const o of this.obstacles) {
      const f = this.grid[o.r][o.c];
      if (f) {
        f.sprite.destroy();
        this.grid[o.r][o.c] = null;
      }
    }
    for (const i of this.idols) {
      const f = this.grid[i.r][i.c];
      if (f) {
        f.sprite.destroy();
        this.grid[i.r][i.c] = null;
      }
    }
    this.grid.flat().forEach((fruit) => {
      if (!fruit) return;
      const { y } = this.gemXY(fruit.r, fruit.c);
      this.tweens.add({
        targets: fruit.sprite,
        y,
        duration: 420 + fruit.r * 45,
        delay: fruit.c * 22,
        ease: 'Bounce.easeOut',
      });
    });
  }

  /** Расстановка препятствий и идолов по данным уровня. */
  private placeLayout(): void {
    if (this.isEvent) return;
    const put = (type: 'vine' | 'slab', cells?: [number, number][]) => {
      cells?.forEach(([r, c]) => {
        const f = this.grid[r][c];
        if (f) {
          f.sprite.destroy();
          this.grid[r][c] = null;
        }
        const { x, y } = this.gemXY(r, c);
        const sprite = this.add.image(x, y, type === 'vine' ? 'vine' : 'slab').setScale(0.3).setAlpha(0);
        this.objLayer.add(sprite);
        this.obstacles.push({ type, r, c, hp: type === 'vine' ? 1 : 2, sprite });
        this.tweens.add({
          targets: sprite,
          scale: 0.62,
          alpha: 1,
          duration: 320,
          delay: 550 + r * 50,
          ease: 'Back.easeOut',
        });
      });
    };
    put('vine', this.level.obstacles?.vines);
    put('slab', this.level.obstacles?.slabs);

    if (this.level.goal.type === 'relic') {
      const n = this.level.goal.amount;
      const spots: [number, number][] = n >= 3 ? [[0, 1], [0, 3], [0, 5]] : [[0, 1], [0, 5]];
      spots.forEach(([r, c], idx) => {
        const f = this.grid[r][c];
        if (f) {
          f.sprite.destroy();
          this.grid[r][c] = null;
        }
        const { x, y } = this.gemXY(r, c);
        const sprite = this.add.image(x, y - 320, 'idol').setScale(0.6);
        this.objLayer.add(sprite);
        this.idols.push({ r, c, sprite });
        this.tweens.add({
          targets: sprite,
          y,
          duration: 520,
          delay: 600 + idx * 170,
          ease: 'Bounce.easeOut',
        });
      });
    }
  }

  private obstacleAt(r: number, c: number): ObstacleObj | null {
    return this.obstacles.find((o) => o.r === r && o.c === c) ?? null;
  }

  private idolAt(r: number, c: number): IdolObj | null {
    return this.idols.find((i) => i.r === r && i.c === c) ?? null;
  }

  /** Урон препятствию (матч рядом = 1, взрыв навыка = 2). */
  private damageObstacle(r: number, c: number, dmg: number): void {
    const o = this.obstacleAt(r, c);
    if (!o) return;
    o.hp -= dmg;
    const { x, y } = this.gemXY(r, c);
    sfx.play('stone');
    if (o.hp <= 0) {
      this.obstacles = this.obstacles.filter((v) => v !== o);
      this.score += 30;
      this.floatText(x, y - 14, '+30', '#c9d6c0', 14);
      const em = this.add
        .particles(x, y, 'spark', {
          speed: { min: 60, max: 260 },
          scale: { start: 0.5, end: 0 },
          lifespan: 420,
          tint: o.type === 'vine' ? 0x7ed321 : 0x9a9da6,
          gravityY: 240,
          emitting: false,
        })
        .setDepth(20);
      em.explode(9);
      this.time.delayedCall(600, () => em.destroy());
      this.tweens.add({
        targets: o.sprite,
        scale: 0.1,
        alpha: 0,
        angle: o.type === 'vine' ? 90 : 0,
        duration: 200,
        ease: 'Quad.easeIn',
        onComplete: () => o.sprite.destroy(),
      });
      this.cameras.main.shake(90, 0.003);
      this.updateHUD();
    } else {
      o.sprite.setTexture('slab_crack');
      this.tweens.add({ targets: o.sprite, x: '+=5', duration: 40, yoyo: true, repeat: 1 });
    }
  }

  private kindGridHasMove(kinds: FruitKind[][]): boolean {
    const at = (r: number, c: number) => kinds[r]?.[c];
    const makesMatch = (r: number, c: number): boolean => {
      const k = at(r, c);
      if (!k) return false;
      let h = 1;
      for (let i = c - 1; at(r, i) === k; i--) h++;
      for (let i = c + 1; at(r, i) === k; i++) h++;
      if (h >= 3) return true;
      let v = 1;
      for (let i = r - 1; at(i, c) === k; i--) v++;
      for (let i = r + 1; at(i, c) === k; i++) v++;
      return v >= 3;
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= ROWS || c2 >= COLS) continue;
          const tmp = kinds[r][c];
          kinds[r][c] = kinds[r2][c2];
          kinds[r2][c2] = tmp;
          const ok = makesMatch(r, c) || makesMatch(r2, c2);
          kinds[r2][c2] = kinds[r][c];
          kinds[r][c] = tmp;
          if (ok) return true;
        }
      }
    }
    return false;
  }

  private findMatches(): MatchGroup[] {
    const marked: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        const same =
          c < COLS && this.grid[r][c] && this.grid[r][c - 1] && this.grid[r][c]!.kind === this.grid[r][c - 1]!.kind;
        if (same) run++;
        else {
          if (run >= 3) for (let i = c - run; i < c; i++) marked[r][i] = true;
          run = 1;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const same =
          r < ROWS && this.grid[r][c] && this.grid[r - 1][c] && this.grid[r][c]!.kind === this.grid[r - 1][c]!.kind;
        if (same) run++;
        else {
          if (run >= 3) for (let i = r - run; i < r; i++) marked[i][c] = true;
          run = 1;
        }
      }
    }
    const seen: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const groups: MatchGroup[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!marked[r][c] || seen[r][c]) continue;
        const kind = this.grid[r][c]!.kind;
        const cells: CellPos[] = [];
        const queue: CellPos[] = [{ r, c }];
        seen[r][c] = true;
        while (queue.length) {
          const cur = queue.shift()!;
          cells.push(cur);
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nr = cur.r + dr;
            const nc = cur.c + dc;
            if (
              nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS &&
              marked[nr][nc] && !seen[nr][nc] && this.grid[nr][nc]?.kind === kind
            ) {
              seen[nr][nc] = true;
              queue.push({ r: nr, c: nc });
            }
          }
        }
        groups.push({ kind, cells });
      }
    }
    return groups;
  }

  private findMove(): { a: CellPos; b: CellPos } | null {
    const makesMatchAt = (r: number, c: number): boolean => {
      const k = this.grid[r][c]?.kind;
      if (!k) return false;
      const kindAt = (rr: number, cc: number) => this.grid[rr]?.[cc]?.kind;
      let h = 1;
      for (let i = c - 1; kindAt(r, i) === k; i--) h++;
      for (let i = c + 1; kindAt(r, i) === k; i++) h++;
      if (h >= 3) return true;
      let v = 1;
      for (let i = r - 1; kindAt(i, c) === k; i--) v++;
      for (let i = r + 1; kindAt(i, c) === k; i++) v++;
      return v >= 3;
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= ROWS || c2 >= COLS) continue;
          const g1 = this.grid[r][c];
          const g2 = this.grid[r2][c2];
          if (!g1 || !g2) continue;
          if (g1.frozen || g2.frozen) continue;
          this.grid[r][c] = g2;
          this.grid[r2][c2] = g1;
          const ok = makesMatchAt(r, c) || makesMatchAt(r2, c2);
          this.grid[r][c] = g1;
          this.grid[r2][c2] = g2;
          if (ok) return { a: { r, c }, b: { r: r2, c: c2 } };
        }
      }
    }
    return null;
  }

  // ---------------- Ввод ----------------

  private buildInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.locked || this.aimSkill) return;
      this.downX = p.x;
      this.downY = p.y;
      this.downFruit = this.fruitAt(p.x, p.y);
      this.dragged = false;
      this.resetHintTimer();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.aimSkill) {
        const cx = Phaser.Math.Clamp(p.x, BOARD_X, BOARD_X + COLS * CELL);
        const cy = Phaser.Math.Clamp(p.y, BOARD_Y, BOARD_Y + ROWS * CELL);
        this.aimRing?.setPosition(cx, cy);
        return;
      }
      if (this.locked || !this.downFruit || this.dragged) return;
      const dx = p.x - this.downX;
      const dy = p.y - this.downY;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      this.dragged = true;
      const src = this.downFruit;
      this.downFruit = null;
      let tr = src.r;
      let tc = src.c;
      if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
      else tr += dy > 0 ? 1 : -1;
      const target = tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS ? this.grid[tr][tc] : null;
      this.clearSelection();
      if (target) void this.trySwap(src, target);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.aimSkill) {
        const c = Math.floor((p.x - BOARD_X) / CELL);
        const r = Math.floor((p.y - BOARD_Y) / CELL);
        const inBoard = r >= 0 && r < ROWS && c >= 0 && c < COLS;
        const onSkills = p.y > 830;
        if (inBoard && !onSkills) {
          const def = this.aimSkill;
          this.aimSkill = null;
          void this.activateSkill(def, { r, c });
        } else if (!onSkills) {
          this.cancelAim();
          sfx.play('tap');
        }
        return;
      }
      if (this.locked || this.dragged) {
        this.downFruit = null;
        return;
      }
      this.downFruit = null;
      const g = this.fruitAt(p.x, p.y);
      if (!g) {
        this.clearSelection();
        return;
      }
      if (this.selected === g) {
        this.clearSelection();
        return;
      }
      if (this.selected && Math.abs(this.selected.r - g.r) + Math.abs(this.selected.c - g.c) === 1) {
        const s = this.selected;
        this.clearSelection();
        void this.trySwap(s, g);
        return;
      }
      this.select(g);
    });
  }

  private fruitAt(x: number, y: number): FruitObj | null {
    const c = Math.floor((x - BOARD_X) / CELL);
    const r = Math.floor((y - BOARD_Y) / CELL);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return this.grid[r][c];
  }

  private select(g: FruitObj): void {
    if (g.frozen) {
      sfx.play('freeze');
      const { x, y } = this.gemXY(g.r, g.c);
      this.floatText(x, y - 44, 'ЗАМОРОЖЕНО!', '#9adcf5', 14);
      this.tweens.add({ targets: g.sprite, x: '-=5', duration: 45, yoyo: true, repeat: 3 });
      return;
    }
    this.clearSelection();
    this.selected = g;
    sfx.play('tap');
    g.sprite.setScale(g.baseScale * 1.13);
    const { x, y } = this.gemXY(g.r, g.c);
    this.ring.setPosition(x, y).setVisible(true).setScale(0.72);
    this.tweens.add({
      targets: this.ring,
      scale: { from: 0.8, to: 0.68 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private clearSelection(): void {
    this.tweens.killTweensOf(this.ring);
    this.ring.setVisible(false);
    if (this.selected) this.selected.sprite.setScale(this.selected.baseScale);
    this.selected = null;
  }

  // ---------------- Обмен и каскады ----------------

  private swapInGrid(a: FruitObj, b: FruitObj): void {
    this.grid[a.r][a.c] = b;
    this.grid[b.r][b.c] = a;
    const ar = a.r;
    const ac = a.c;
    a.r = b.r;
    a.c = b.c;
    b.r = ar;
    b.c = ac;
  }

  private tweenSwap(a: FruitObj, b: FruitObj): Promise<void> {
    const pa = this.gemXY(a.r, a.c);
    const pb = this.gemXY(b.r, b.c);
    return new Promise((resolve) => {
      this.tweens.add({ targets: a.sprite, x: pa.x, y: pa.y, duration: 140, ease: 'Cubic.easeOut' });
      this.tweens.add({
        targets: b.sprite,
        x: pb.x,
        y: pb.y,
        duration: 140,
        ease: 'Cubic.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private async trySwap(a: FruitObj, b: FruitObj): Promise<void> {
    if (this.locked) return;
    this.locked = true;
    this.clearSelection();
    this.resetHintTimer();
    if (a.frozen || b.frozen) {
      sfx.play('freeze');
      const t = a.frozen ? a : b;
      const { x, y } = this.gemXY(t.r, t.c);
      this.floatText(x, y - 44, 'ЗАМОРОЖЕНО!', '#9adcf5', 14);
      this.locked = false;
      return;
    }
    sfx.play('swap');
    sfx.vibrate('light');
    this.swapInGrid(a, b);
    await this.tweenSwap(a, b);
    if (!this.scene.isActive('GameScene')) return;

    if (this.findMatches().length === 0) {
      sfx.play('invalid');
      this.swapInGrid(a, b);
      await this.tweenSwap(a, b);
      this.tweens.add({ targets: [a.sprite, b.sprite], x: '-=6', duration: 50, yoyo: true, repeat: 2 });
      this.locked = false;
      this.resetHintTimer();
      return;
    }

    this.moves--;
    this.updateHUD();
    await this.cascadeLoop();
    await this.finishTurn();
  }

  private async cascadeLoop(): Promise<void> {
    let chain = 0;
    while (this.scene.isActive('GameScene')) {
      const groups = this.findMatches();
      if (groups.length === 0) break;
      chain++;
      if (chain >= 2) this.showChainText(chain);
      const wave = this.collectRemovals(groups);
      await this.popWave(wave, groups, chain);
      if (!this.scene.isActive('GameScene')) return;
      await this.collapse();
    }
  }

  private async finishTurn(): Promise<void> {
    if (!this.scene.isActive('GameScene')) return;
    this.updateHUD();
    if (this.goalMet()) {
      // цель выполнена: остаток ходов превращается в солнечные бомбы
      if (this.moves > 0) {
        await this.bonusPhase();
        if (!this.scene.isActive('GameScene')) return;
      }
      await this.winSequence();
      return;
    }
    if (this.moves <= 0) {
      this.loseSequence();
      return;
    }
    // босс контратакует каждые 5 ходов
    if (
      !this.isEvent &&
      this.level.type === 'boss' &&
      this.moves > 0 &&
      (this.level.moves - this.moves) % 5 === 0
    ) {
      await this.bossFreeze();
      if (!this.scene.isActive('GameScene')) return;
    }
    if (!this.findMove()) {
      await this.shuffleBoard();
    }
    this.locked = false;
    this.resetHintTimer();
  }

  /** Крупный заголовок по центру поля (на время бонус-фазы). */
  private banner(str: string, color: string, size = 24): void {
    const t = this.add
      .text(GAME_W / 2, 410, str, {
        fontFamily: RUSSO,
        fontSize: `${size}px`,
        color,
        stroke: '#06281a',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(46);
    this.tweens.add({ targets: t, scale: { from: 0.3, to: 1 }, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 366, delay: 750, duration: 380, onComplete: () => t.destroy() });
  }

  /**
   * Финал уровня в стиле Монтесумы: цель уже выполнена, поэтому каждый
   * оставшийся ход автоматически превращается в «солнечную бомбу», которая
   * взрывает 3×3 (с цепными детонациями реликвий) и приносит очки —
   * так можно дотянуть до 2–3 звёзд.
   */
  private async bonusPhase(): Promise<void> {
    this.cancelAim();
    this.clearSelection();
    this.hintTimer?.destroy();
    this.banner('ЦЕЛЬ ВЫПОЛНЕНА!', '#9dffce', 27);
    sfx.play('star');
    await this.sleep(700);
    if (!this.scene.isActive('GameScene')) return;
    if (this.moves > 0) {
      this.banner(`ОСТАТОК ХОДОВ: ${this.moves} → БОМБЫ!`, '#ffd76a', 21);
      sfx.play('boost');
      await this.sleep(650);
    }
    let guard = 0;
    while (this.moves > 0 && guard++ < 30 && this.scene.isActive('GameScene')) {
      this.moves--;
      this.updateHUD();
      await this.detonateRandomBomb();
      await this.sleep(90);
    }
  }

  /** Одна солнечная бомба: выбираем клетку (приоритет реликвиям) и взрываем. */
  private async detonateRandomBomb(): Promise<void> {
    const cells: CellPos[] = [];
    this.grid.forEach((row, r) =>
      row.forEach((f, c) => {
        if (f) cells.push({ r, c });
      }),
    );
    if (!cells.length) return;
    const specials = cells.filter(({ r, c }) => this.grid[r][c]?.special);
    const pick =
      specials.length && Math.random() < 0.75
        ? specials[Math.floor(Math.random() * specials.length)]
        : cells[Math.floor(Math.random() * cells.length)];
    const { x, y } = this.gemXY(pick.r, pick.c);

    const bomb = this.add.image(x, y, 'megabomb').setScale(0.05).setDepth(22);
    sfx.play('swap');
    this.tweens.add({ targets: bomb, scale: 0.72, duration: 170, ease: 'Back.easeOut' });
    this.floatText(x, y - 48, 'БОНУС!', '#ffd76a', 15);
    await this.sleep(220);
    if (!this.scene.isActive('GameScene')) {
      bomb.destroy();
      return;
    }
    const wave = this.collectBlastRemoval(pick.r, pick.c);
    bomb.destroy();
    this.cameras.main.shake(150, 0.006);
    sfx.play('boost');
    await this.popWave(wave, [], 1);
    if (!this.scene.isActive('GameScene')) return;
    await this.collapse();
  }

  /** Атака босса: замораживает 3 случайные клетки. */
  private async bossFreeze(): Promise<void> {
    const candidates: FruitObj[] = [];
    this.grid.forEach((row) =>
      row.forEach((f) => {
        if (f && !f.frozen) candidates.push(f);
      }),
    );
    const n = Math.min(3, candidates.length);
    if (!n) return;
    Phaser.Utils.Array.Shuffle(candidates);
    this.floatText(GAME_W / 2, 380, 'БОСС МОРОЗИТ ПОЛЕ!', '#9adcf5', 20);
    sfx.play('freeze');
    sfx.vibrate('medium');
    if (this.bossSprite) {
      this.tweens.add({ targets: this.bossSprite, scale: { from: 1.3, to: 1.05 }, duration: 320, ease: 'Quad.easeOut' });
    }
    for (let i = 0; i < n; i++) {
      const f = candidates[i];
      const ice = this.add.image(f.sprite.x, f.sprite.y, 'ice').setScale(0.01).setDepth(13);
      f.frozen = ice;
      this.tweens.add({ targets: ice, scale: 0.68, duration: 260, delay: i * 130, ease: 'Back.easeOut' });
    }
    this.cameras.main.flash(220, 120, 200, 255);
    await this.sleep(480);
  }

  /** Собирает волну очистки: совпадения + цепные детонации реликвий + новые реликвии. */
  private collectRemovals(groups: MatchGroup[]): Wave {
    const removed = new Set<string>();
    for (const g of groups) for (const cell of g.cells) removed.add(`${cell.r},${cell.c}`);

    // длинные комбо оставляют после себя реликвию
    const spawns: SpawnDef[] = [];
    for (const g of groups) {
      if (g.cells.length >= 4) {
        const at = g.cells[Math.floor(g.cells.length / 2)];
        spawns.push({ r: at.r, c: at.c, kind: g.kind, type: g.cells.length >= 5 ? 'eye' : 'torch' });
        removed.delete(`${at.r},${at.c}`);
      }
    }

    const detonations = this.expandSpecials(removed);
    return { removed, spawns, detonations };
  }

  /** Волна от солнечной бомбы: 3×3 + цепные детонации реликвий. */
  private collectBlastRemoval(cr: number, cc: number): Wave {
    const removed = new Set<string>();
    for (let r = cr - 1; r <= cr + 1; r++) {
      for (let c = cc - 1; c <= cc + 1; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.grid[r][c]) removed.add(`${r},${c}`);
      }
    }
    const detonations = this.expandSpecials(removed);
    return { removed, spawns: [], detonations };
  }

  /** Цепные детонации реликвий, задетых волной. Возвращает число сработавших. */
  private expandSpecials(removed: Set<string>): number {
    const processed = new Set<string>();
    let detonations = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of Array.from(removed)) {
        if (processed.has(key)) continue;
        const [r, c] = key.split(',').map(Number);
        const fruit = this.grid[r][c];
        if (!fruit || !fruit.special) continue;
        processed.add(key);
        changed = true;
        detonations++;
        if (fruit.special === 'torch') {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) removed.add(`${nr},${nc}`);
            }
          }
        } else {
          // Око бога стирает самый частый вид на поле
          const counts = new Map<FruitKind, number>();
          for (let rr = 0; rr < ROWS; rr++) {
            for (let cc = 0; cc < COLS; cc++) {
              const k = this.grid[rr][cc]?.kind;
              if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
            }
          }
          let best: FruitKind = FRUIT_KINDS[0];
          let bestN = -1;
          counts.forEach((cnt, k) => {
            if (cnt > bestN) {
              bestN = cnt;
              best = k;
            }
          });
          for (let rr = 0; rr < ROWS; rr++) {
            for (let cc = 0; cc < COLS; cc++) {
              if (this.grid[rr][cc]?.kind === best) removed.add(`${rr},${cc}`);
            }
          }
        }
      }
    }
    return detonations;
  }

  private async popWave(wave: Wave, groups: MatchGroup[], chain: number): Promise<void> {
    let bonus = 0;
    for (const g of groups) bonus += g.cells.length === 4 ? 60 : g.cells.length >= 5 ? 150 : 0;
    const n = wave.removed.size;
    const gained = (n * 20 + bonus + wave.detonations * 40) * chain;
    this.score += gained;

    let cx = 0;
    let cy = 0;
    let counted = 0;
    const collectKind = this.level.goal.type === 'collect' ? this.level.goal.kind : null;
    const perCellParticles = n > 36 ? 3 : 7;
    const kindCounts = new Map<FruitKind, number>();

    wave.removed.forEach((key) => {
      const [r, c] = key.split(',').map(Number);
      const fruit = this.grid[r][c];
      this.grid[r][c] = null;
      if (!fruit) return;
      const { x, y } = this.gemXY(r, c);
      cx += x;
      cy += y;
      kindCounts.set(fruit.kind, (kindCounts.get(fruit.kind) ?? 0) + 1);
      if (collectKind && fruit.kind === collectKind) counted++;
      const color = FRUIT_COLORS[fruit.kind];
      const em = this.add.particles(x, y, 'spark', {
        speed: { min: 60, max: 260 },
        scale: { start: 0.55, end: 0 },
        lifespan: 430,
        tint: color.light,
        gravityY: 180,
        emitting: false,
      }).setDepth(20);
      em.explode(perCellParticles);
      this.time.delayedCall(700, () => em.destroy());
      if (fruit.aura) fruit.aura.destroy();
      if (fruit.frozen) fruit.frozen.destroy();
      this.tweens.add({
        targets: fruit.sprite,
        scale: 0.85,
        alpha: 0,
        duration: 150,
        ease: 'Quad.easeIn',
        onComplete: () => fruit.sprite.destroy(),
      });
    });

    // матчи рядом разрушают препятствия и размораживают клетки
    const hitObs = new Set<ObstacleObj>();
    wave.removed.forEach((key) => {
      const [r, c] = key.split(',').map(Number);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const o = this.obstacleAt(nr, nc);
        if (o) hitObs.add(o);
        const nf = this.grid[nr][nc];
        if (nf?.frozen) {
          nf.frozen.destroy();
          nf.frozen = undefined;
          const p = this.gemXY(nr, nc);
          const em = this.add
            .particles(p.x, p.y, 'spark', {
              speed: { min: 40, max: 180 },
              scale: { start: 0.45, end: 0 },
              lifespan: 380,
              tint: 0xcdf0ff,
              gravityY: 120,
              emitting: false,
            })
            .setDepth(20);
          em.explode(6);
          this.time.delayedCall(550, () => em.destroy());
        }
      }
    });
    hitObs.forEach((o) => this.damageObstacle(o.r, o.c, 1));

    kindCounts.forEach((cnt, kind) => this.chargeSkill(kind, cnt));
    if (counted > 0) {
      this.collected += counted;
      this.bumpBoss();
      if (this.level.type === 'boss') sfx.vibrate('medium');
    }
    if (n > 0) {
      cx /= n;
      cy /= n;
    }

    if (wave.detonations > 0) {
      this.cameras.main.flash(180, 255, 214, 120);
      this.cameras.main.shake(220, 0.009);
      sfx.play('boost');
      sfx.vibrate('heavy');
    }

    // реликвии вспыхивают на месте длинных комбо
    for (const sp of wave.spawns) {
      const fruit = this.grid[sp.r][sp.c];
      if (!fruit) continue;
      fruit.special = sp.type;
      const { x, y } = this.gemXY(sp.r, sp.c);
      const aura = this.add.image(x, y, sp.type === 'torch' ? 'aura_torch' : 'aura_eye').setScale(0.62);
      this.board.add(aura);
      fruit.aura = aura;
      this.tweens.add({
        targets: aura,
        scale: { from: 0.62, to: 0.74 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      const fl = this.add.image(x, y, 'glow').setTint(sp.type === 'torch' ? 0xffb020 : 0x9dffce).setScale(0.35).setDepth(22);
      this.tweens.add({ targets: fl, scale: 1.5, alpha: 0, duration: 420, onComplete: () => fl.destroy() });
      this.floatText(x, y - 36, sp.type === 'torch' ? 'ОГНЕННЫЙ ЖЕЗЛ!' : 'ОКО БОГА!', sp.type === 'torch' ? '#ffb020' : '#9dffce', 16);
      sfx.play('boost');
    }

    this.floatText(cx || GAME_W / 2, (cy || 420) - 10, `+${gained}`, chain >= 2 ? '#9dffce' : '#ffd76a', 17 + Math.min(chain, 4) * 2);
    sfx.play('match', chain);
    this.updateHUD();

    if (n >= 4 || chain >= 2) {
      sfx.vibrate('medium');
      this.cameras.main.shake(130, Math.min(0.008, 0.0025 * n + 0.0015 * chain));
    }
    if (chain >= 3) {
      const flash = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 0.22).setDepth(35);
      this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    }
    await this.sleep(175);
  }

  private moveFruit(fruit: FruitObj): Promise<void> {
    const { x, y } = this.gemXY(fruit.r, fruit.c);
    const dist = Math.abs(y - fruit.sprite.y) / CELL;
    if (fruit.frozen) {
      this.tweens.add({ targets: fruit.frozen, x, y, duration: 110 + dist * 35, ease: 'Cubic.easeIn' });
    }
    return new Promise((resolve) => {
      this.tweens.add({
        targets: fruit.aura ? [fruit.sprite, fruit.aura] : fruit.sprite,
        x,
        y,
        duration: 110 + dist * 35,
        ease: 'Cubic.easeIn',
        onComplete: () => resolve(),
      });
    });
  }

  /** Идолы падают вниз; достигшие дна — собираются. */
  private async dropIdols(): Promise<void> {
    if (!this.idols.length) return;
    const promises: Promise<void>[] = [];
    const collectedNow: IdolObj[] = [];
    const sorted = [...this.idols].sort((a, b) => b.r - a.r);
    for (const idol of sorted) {
      const startR = idol.r;
      while (
        idol.r + 1 < ROWS &&
        !this.grid[idol.r + 1][idol.c] &&
        !this.obstacleAt(idol.r + 1, idol.c) &&
        !this.idolAt(idol.r + 1, idol.c)
      ) {
        idol.r++;
      }
      if (idol.r === ROWS - 1) collectedNow.push(idol);
      if (idol.r !== startR) {
        const { x, y } = this.gemXY(idol.r, idol.c);
        const dist = idol.r - startR;
        promises.push(
          new Promise((resolve) => {
            this.tweens.add({
              targets: idol.sprite,
              x,
              y,
              duration: 130 + dist * 55,
              ease: 'Bounce.easeOut',
              onComplete: () => resolve(),
            });
          }),
        );
      }
    }
    if (promises.length) {
      sfx.play('fall');
      await Promise.all(promises);
    }
    for (const idol of collectedNow) {
      this.idols = this.idols.filter((i) => i !== idol);
      const { x, y } = this.gemXY(idol.r, idol.c);
      this.collected++;
      this.score += 200;
      sfx.play('star');
      sfx.vibrate('medium');
      this.floatText(x, y - 24, 'ИДОЛ СПАСЁН! +200', '#ffd76a', 16);
      const em = this.add
        .particles(x, y, 'spark', {
          speed: { min: 90, max: 330 },
          scale: { start: 0.7, end: 0 },
          lifespan: 650,
          tint: [0xffd76a, 0xf5b52e, 0xfff2c9],
          gravityY: 260,
          emitting: false,
        })
        .setDepth(20);
      em.explode(16);
      this.time.delayedCall(750, () => em.destroy());
      this.tweens.add({
        targets: idol.sprite,
        y: y + 46,
        alpha: 0,
        scale: 0.2,
        duration: 360,
        ease: 'Cubic.easeIn',
        onComplete: () => idol.sprite.destroy(),
      });
      this.cameras.main.shake(120, 0.004);
      this.updateHUD();
    }
  }

  private async collapse(): Promise<void> {
    // 1) уплотнение фруктов (препятствия и идолы — «пол»)
    const promises: Promise<void>[] = [];
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const fruit = this.grid[r][c];
        if (fruit) {
          if (write !== r) {
            this.grid[write][c] = fruit;
            this.grid[r][c] = null;
            fruit.r = write;
            promises.push(this.moveFruit(fruit));
          }
          write--;
        } else if (this.obstacleAt(r, c) || this.idolAt(r, c)) {
          write = r - 1;
        }
      }
    }
    if (promises.length) {
      sfx.play('fall');
      await Promise.all(promises);
    }
    // 2) падение идолов
    await this.dropIdols();
    // 3) дозаполнение пустых клеток сверху
    const fill: Promise<void>[] = [];
    for (let c = 0; c < COLS; c++) {
      let empties = 0;
      for (let r = 0; r < ROWS; r++) {
        if (!this.grid[r][c] && !this.obstacleAt(r, c) && !this.idolAt(r, c)) empties++;
      }
      let k = 0;
      for (let r = 0; r < ROWS; r++) {
        if (this.grid[r][c] || this.obstacleAt(r, c) || this.idolAt(r, c)) continue;
        const kind = this.randomKind();
        const { x, y } = this.gemXY(r, c);
        const baseScale = this.fitScale(`fruit_${kind}`, 56);
        const sprite = this.add
          .image(x, y - (empties - k) * CELL - 30, `fruit_${kind}`)
          .setScale(baseScale);
        k++;
        this.board.add(sprite);
        const fruit: FruitObj = { kind, sprite, baseScale, r, c };
        this.grid[r][c] = fruit;
        fill.push(this.moveFruit(fruit));
      }
    }
    if (fill.length) {
      await Promise.all(fill);
      await this.sleep(40);
    }
  }

  private async shuffleBoard(): Promise<void> {
    this.floatText(GAME_W / 2, GAME_H / 2, 'НЕТ ХОДОВ — ПЕРЕМЕШИВАЮ!', '#9dffce', 22);
    sfx.play('swap');
    await this.sleep(650);
    if (!this.scene.isActive('GameScene')) return;
    this.genBoard();
    await this.sleep(600);
  }

  // ---------------- Эффекты ----------------

  private floatText(x: number, y: number, str: string, color: string, size: number): void {
    const t = this.add.text(x, y, str, {
      fontFamily: RUSSO,
      fontSize: `${size}px`,
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({
      targets: t,
      y: y - 52,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.7, to: 1.15 },
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private showChainText(chain: number): void {
    const words = ['', '', 'ЦЕПОЧКА x2!', 'ВЕЛИКОЛЕПНО x3!', 'БОЖЕСТВЕННО x4!'];
    const word = chain >= 5 ? `НЕВЕРОЯТНО x${chain}!` : words[chain];
    const t = this.add.text(GAME_W / 2, 420, word, {
      fontFamily: RUSSO,
      fontSize: '30px',
      color: '#9dffce',
      stroke: '#06281a',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({
      targets: t,
      scale: { from: 0.4, to: 1.1 },
      alpha: { from: 1, to: 0 },
      y: 380,
      duration: 900,
      ease: 'Back.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private confetti(): void {
    [-140, 0, 140].forEach((dx, i) => {
      this.time.delayedCall(i * 160, () => {
        const em = this.add.particles(GAME_W / 2 + dx, 260, 'spark', {
          speed: { min: 140, max: 420 },
          angle: { min: 210, max: 330 },
          scale: { start: 0.8, end: 0 },
          lifespan: 950,
          tint: [0xffd76a, 0x9dffce, 0xff97a8, 0xa3c6ff, 0xe0bdff],
          gravityY: 330,
          emitting: false,
        }).setDepth(50);
        em.explode(36);
        this.time.delayedCall(1100, () => em.destroy());
      });
    });
  }

  // ---------------- Подсказка ----------------

  private resetHintTimer(): void {
    this.hintTimer?.destroy();
    this.hintTimer = this.time.delayedCall(5500, () => this.showHint());
  }

  private showHint(): void {
    if (this.locked) return;
    const mv = this.findMove();
    if (!mv) {
      void this.shuffleBoard();
      return;
    }
    [mv.a, mv.b].forEach((pos) => {
      const { x, y } = this.gemXY(pos.r, pos.c);
      const ring = this.add.image(x, y, 'ring').setScale(0.62).setDepth(15).setAlpha(0);
      this.tweens.add({
        targets: ring,
        alpha: { from: 0.9, to: 0.15 },
        scale: { from: 0.72, to: 0.56 },
        duration: 420,
        yoyo: true,
        repeat: 3,
        onComplete: () => ring.destroy(),
      });
    });
  }

  // ---------------- Победа / поражение ----------------

  private goalMet(): boolean {
    const g = this.level.goal;
    if (g.type === 'collect' || g.type === 'relic') return this.collected >= g.amount;
    return this.score >= g.amount;
  }

  private starCount(): number {
    let stars = 1;
    if (this.score >= this.level.parScore * 1.5) stars = 2;
    if (this.score >= this.level.parScore * 2.2) stars = 3;
    return stars;
  }

  private async winSequence(): Promise<void> {
    this.locked = true;
    this.overlayOpen = true;
    sfx.play('win');
    sfx.vibrate('heavy');

    if (this.level.type === 'boss' && this.bossSprite) {
      this.tweens.add({
        targets: this.bossSprite,
        angle: 540,
        y: '+=160',
        alpha: 0,
        duration: 900,
        ease: 'Cubic.easeIn',
      });
      this.cameras.main.shake(300, 0.008);
    }
    this.confetti();

    if (this.isEvent) {
      const res = playerState.completeEventStage(this.eventStageN);
      this.scene.get('UIScene')?.events.emit('coinFly', 6);
      await this.sleep(800);
      if (!this.scene.isActive('GameScene')) return;
      this.showEventWinOverlay(res.coins, res.gems);
      return;
    }

    const stars = this.starCount();
    const boost = playerState.boostActive('coins2x');
    const coins = this.level.rewardCoins * (boost ? 2 : 1);
    const cardInfo = playerState.awardRandomCard();
    const setDone = playerState.tryCompleteSet();
    playerState.completeLevel(this.level.id, stars, coins, this.level.rewardGems);

    this.scene.get('UIScene')?.events.emit('coinFly', 4 + stars * 2);
    await this.sleep(800);
    if (!this.scene.isActive('GameScene')) return;
    this.showWinOverlay(stars, coins, boost, cardInfo, setDone);
  }

  /** Победа в ступени ивента. */
  private showEventWinOverlay(coins: number, giftGems: number): void {
    const pop = new Popup(this, 450, 500);
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(
      this.add.text(0, -176, `СТУПЕНЬ ${this.eventStageN} ПРОЙДЕНА!`, {
        fontFamily: RUSSO, fontSize: '26px', color: '#ff9a3d',
      }).setOrigin(0.5).setShadow(0, 4, '#000000', 8),
    );
    items.push(this.add.image(0, -108, 'bird').setScale(1.15));
    items.push(
      this.add.text(0, -44, `Очки: ${fmtNum(this.score)}`, {
        fontFamily: RUSSO, fontSize: '19px', color: '#f9ecc8',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.image(-52, 2, 'coin').setScale(0.8),
      this.add.text(-18, 3, `+${coins}`, { fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8' }).setOrigin(0, 0.5),
    );
    if (giftGems > 0) {
      items.push(
        this.add.text(0, 52, `РУБЕЖНЫЙ ПОДАРОК!`, {
          fontFamily: RUSSO, fontSize: '16px', color: '#ffd76a',
        }).setOrigin(0.5),
      );
      items.push(
        this.add.image(-24, 84, 'gemIcon').setScale(0.75),
        this.add.text(8, 85, `+${giftGems}`, { fontFamily: RUSSO, fontSize: '21px', color: '#9dffce' }).setOrigin(0, 0.5),
      );
    }
    const done = this.eventStageN >= EVENT_STAGES;
    items.push(
      makeButton(
        this,
        done ? 'ВОСХОЖДЕНИЕ ЗАВЕРШЕНО!' : `СТУПЕНЬ ${this.eventStageN + 1}`,
        () => {
          if (done) this.exitToMap();
          else this.scene.restart({ eventStage: this.eventStageN + 1 });
        },
        { w: 360, h: 70, style: done ? 'gold' : 'green', font: 19 },
      ).setPosition(0, done ? 130 : 128),
    );
    items.push(
      makeButton(this, 'НА КАРТУ', () => this.exitToMap(), { w: 360, h: 56, style: 'dark', font: 16 }).setPosition(0, 212),
    );
    pop.add(items);
  }

  private showWinOverlay(
    stars: number,
    coins: number,
    boost: boolean,
    cardInfo?: { cardId: string; name: string; isNew: boolean; dupCoins: number } | null,
    setDone?: boolean,
  ): void {
    const pop = new Popup(this, 460, setDone ? 660 : cardInfo ? 630 : 560);
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];

    items.push(
      this.add.text(0, -200, 'СТУПЕНЬ ПРОЙДЕНА!', {
        fontFamily: RUSSO, fontSize: '34px', color: '#f5b52e',
      }).setOrigin(0.5).setShadow(0, 4, '#000000', 8),
    );

    for (let i = 0; i < 3; i++) {
      const earned = i < stars;
      const st = this.add.image((i - 1) * 74, -122, 'star')
        .setScale(earned ? 0.01 : 0.85)
        .setTint(earned ? 0xffd76a : 0x33413a);
      items.push(st);
      if (earned) {
        this.time.delayedCall(350 + i * 300, () => {
          if (!st.active) return;
          sfx.play('star');
          this.tweens.add({
            targets: st,
            scale: { from: 0.01, to: 1.3 },
            duration: 320,
            ease: 'Back.easeOut',
            onComplete: () => {
              this.tweens.add({ targets: st, scale: 1.05, duration: 140, ease: 'Quad.easeOut' });
            },
          });
        });
      }
    }

    items.push(
      this.add.text(0, -48, `Очки: ${fmtNum(this.score)}`, {
        fontFamily: RUSSO, fontSize: '20px', color: '#f9ecc8',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.image(-60, 6, 'coin').setScale(0.8),
      this.add.text(-24, 7, `+${coins}`, { fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8' }).setOrigin(0, 0.5),
    );
    if (boost) {
      items.push(this.add.text(44, 7, 'x2', { fontFamily: RUSSO, fontSize: '16px', color: '#ffd76a' }).setOrigin(0, 0.5));
    }
    if (this.level.rewardGems > 0) {
      items.push(
        this.add.image(100, 6, 'gemIcon').setScale(0.72),
        this.add.text(132, 7, `+${this.level.rewardGems}`, { fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8' }).setOrigin(0, 0.5),
      );
    }

    // карточка коллекции
    let extraY = 0;
    if (cardInfo) {
      extraY = 62;
      items.push(this.add.image(-92, 56, 'card').setScale(0.72));
      items.push(this.add.image(-92, 56, `card_${cardInfo.cardId}`).setScale(0.62));
      items.push(
        this.add.text(16, 48, cardInfo.isNew ? 'НОВАЯ КАРТА!' : 'ДУБЛИКАТ', {
          fontFamily: RUSSO, fontSize: '15px', color: cardInfo.isNew ? '#9dffce' : '#ffd76a',
        }).setOrigin(0.5),
      );
      items.push(
        this.add.text(16, 70, cardInfo.isNew ? cardInfo.name : `${cardInfo.name} · +${cardInfo.dupCoins} монет`, {
          fontFamily: RUBIK, fontSize: '13.5px', color: '#f9ecc8',
        }).setOrigin(0.5),
      );
    }
    if (setDone) {
      extraY = 118;
      const sy = cardInfo ? 116 : 56;
      items.push(this.add.image(-92, sy, 'card').setScale(0.72).setTint(0xffd76a));
      items.push(this.add.image(-92, sy, 'card_sun').setScale(0.62));
      items.push(
        this.add.text(16, sy - 8, 'КОЛЛЕКЦИЯ СОБРАНА!', {
          fontFamily: RUSSO, fontSize: '15px', color: '#ffd76a',
        }).setOrigin(0.5),
      );
      items.push(
        this.add.text(16, sy + 14, '+500 монет · +10 гемов', {
          fontFamily: RUBIK, fontSize: '13.5px', color: '#f9ecc8',
        }).setOrigin(0.5),
      );
      sfx.play('chest');
    }

    if (this.level.id < 24) {
      items.push(
        makeButton(this, 'СЛЕДУЮЩАЯ СТУПЕНЬ', () => {
          this.scene.restart({ levelId: this.level.id + 1 });
        }, { w: 360, h: 72, style: 'green', font: 20 }).setPosition(0, 108 + extraY),
      );
    } else {
      items.push(
        this.add.text(0, 104 + extraY, 'Ты поднялся на вершину Лестницы Бога!\nБоги даровали тебе вечную славу!', {
          fontFamily: RUBIK, fontSize: '16px', fontStyle: 'bold', color: '#9dffce',
          wordWrap: { width: 380 }, align: 'center',
        }).setOrigin(0.5),
      );
    }
    items.push(
      makeButton(this, 'НА КАРТУ', () => this.exitToMap(), { w: 360, h: 60, style: 'dark', font: 17 }).setPosition(0, 196 + extraY),
    );
    pop.add(items);
  }

  private loseSequence(): void {
    this.locked = true;
    this.overlayOpen = true;
    sfx.play('lose');
    sfx.vibrate('heavy');
    this.cameras.main.flash(300, 130, 30, 30);
    if (!this.isEvent && !this.lifeLost) {
      this.lifeLost = true;
      playerState.loseLife();
    }
    this.time.delayedCall(650, () => {
      if (!this.scene.isActive('GameScene')) return;
      this.showLoseOverlay();
    });
  }

  private showLoseOverlay(): void {
    const pop = new Popup(this, 440, 470);
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(
      this.add.text(0, -150, 'ХОДЫ ЗАКОНЧИЛИСЬ', {
        fontFamily: RUSSO, fontSize: '26px', color: '#ff8a76',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, -96, `Очки: ${fmtNum(this.score)}`, {
        fontFamily: RUSSO, fontSize: '19px', color: '#f9ecc8',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, -60, this.isEvent ? 'Жар-птица улетела… Попробуй ещё!' : '-1 жизнь. Боги ждут реванша!', {
        fontFamily: RUBIK, fontSize: '14px', color: '#b9ad87',
      }).setOrigin(0.5),
    );
    items.push(
      makeButton(this, 'ПОВТОРИТЬ', () => {
        if (this.isEvent) {
          this.scene.restart({ eventStage: this.eventStageN });
        } else if (playerState.livesNow() > 0) {
          this.scene.restart({ levelId: this.level.id });
        } else {
          pop.close();
          this.openOutOfLives();
        }
      }, { w: 340, h: 68, style: 'gold', font: 21 }).setPosition(0, 20),
    );
    items.push(
      makeButton(this, 'НА КАРТУ', () => this.exitToMap(), { w: 340, h: 58, style: 'dark', font: 17 }).setPosition(0, 110),
    );
    pop.add(items);
  }

  private openOutOfLives(): void {
    const pop = new Popup(this, 420, 380, 'НЕТ ЖИЗНЕЙ');
    pop.closable = false;
    const waitText = this.add.text(0, -60, `До новой жизни: ${fmtTime(playerState.nextLifeInMs())}`, {
      fontFamily: RUBIK, fontSize: '15px', color: '#f9ecc8',
    }).setOrigin(0.5);
    const timer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => waitText.setText(`До новой жизни: ${fmtTime(playerState.nextLifeInMs())}`),
    });
    pop.setCloseHandler(() => timer.destroy());
    const adBtn = makeButton(this, 'РЕКЛАМА · +1 ЖИЗНЬ', async () => {
      const ok = await vk.showRewardedAd();
      if (ok && this.scene.isActive('GameScene')) {
        playerState.addLife();
        sfx.play('heart');
        this.scene.restart({ levelId: this.level.id });
      }
    }, { w: 320, h: 64, style: 'gold', font: 18 }).setPosition(0, 20);
    const backBtn = makeButton(this, 'НА КАРТУ', () => this.exitToMap(), {
      w: 320, h: 56, style: 'dark', font: 16,
    }).setPosition(0, 104);
    pop.add([waitText, adBtn, backBtn]);
  }

  // ---------------- Пауза / выход ----------------

  private openPause(): void {
    if (this.overlayOpen) return;
    this.locked = true;
    this.overlayOpen = true;
    this.cancelAim();
    const pop = new Popup(this, 400, 430, 'ПАУЗА');
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(
      makeButton(this, 'ПРОДОЛЖИТЬ', () => {
        pop.close();
        this.locked = false;
        this.overlayOpen = false;
        this.resetHintTimer();
      }, { w: 320, h: 66, style: 'green', font: 20 }).setPosition(0, -96),
    );
    items.push(
      makeButton(this, 'ЗАНОВО', () => this.scene.restart({ levelId: this.level.id }), {
        w: 320, h: 60, style: 'dark', font: 18,
      }).setPosition(0, -18),
    );
    items.push(
      makeButton(
        this,
        playerState.data.settings.sound ? 'ЗВУК: ВКЛ' : 'ЗВУК: ВЫКЛ',
        () => {
          playerState.setSetting('sound', !playerState.data.settings.sound);
          this.scene.restart({ levelId: this.level.id });
        },
        { w: 320, h: 60, style: 'dark', font: 18 },
      ).setPosition(0, 60),
    );
    items.push(
      makeButton(this, 'НА КАРТУ', () => this.exitToMap(), {
        w: 320, h: 60, style: 'red', font: 18,
      }).setPosition(0, 138),
    );
    pop.add(items);
  }

  private exitToMap(): void {
    this.scene.stop('GameScene');
    this.scene.start('MapScene');
    this.scene.launch('UIScene');
  }

  private restartData(): { levelId?: number; eventStage?: number } {
    return this.isEvent ? { eventStage: this.eventStageN } : { levelId: this.level.id };
  }

  // ---------------- Стартовый оверлей ----------------

  private showStartOverlay(): void {
    const boss = this.level.type === 'boss';
    const pop = new Popup(this, 440, boss ? 520 : 440, `СТУПЕНЬ ${this.level.id}`);
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(
      this.add.text(0, -168, this.level.name, {
        fontFamily: RUBIK, fontSize: '16px', fontStyle: 'bold', color: '#b9ad87',
      }).setOrigin(0.5),
    );
    if (boss) {
      items.push(this.add.image(0, -116, 'skull').setScale(1.1));
      items.push(
        this.add.text(0, -68, `Победи: ${this.level.bossName}`, {
          fontFamily: RUSSO, fontSize: '15px', color: '#ff8a76',
        }).setOrigin(0.5),
      );
    }
    const goalStr =
      this.level.goal.type === 'collect'
        ? `Собери ${this.level.goal.amount} × ${FRUIT_NAMES[this.level.goal.kind]}`
        : `Набери ${fmtNum(this.level.goal.amount)} очков`;
    items.push(
      this.add.text(0, boss ? -34 : -104, `Цель: ${goalStr}`, {
        fontFamily: RUBIK, fontSize: '17px', fontStyle: 'bold', color: '#f9ecc8',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, boss ? 0 : -68, `Ходы: ${this.level.moves}`, {
        fontFamily: RUSSO, fontSize: '18px', color: '#9dffce',
      }).setOrigin(0.5),
    );
    if (boss) {
      items.push(
        this.add.text(
          0,
          40,
          `Боевые навыки заряжаются кристаллами:\nОгонь — ${FRUIT_NAMES[SKILLS[0].kind]}, Молния — ${FRUIT_NAMES[SKILLS[1].kind]},\nВетер — ${FRUIT_NAMES[SKILLS[2].kind]}`,
          {
          fontFamily: RUBIK, fontSize: '13px', color: '#8fd8b4', align: 'center',
        }).setOrigin(0.5),
      );
    }
    items.push(
      this.add.text(
        0,
        boss ? 92 : -16,
        'Тяни кристалл в сторону соседа\nили коснись двух соседних по очереди\n\nВыполнил цель — остаток ходов\nвзорвётся солнечными бомбами!',
        { fontFamily: RUBIK, fontSize: '13.5px', color: '#8fd8b4', align: 'center' },
      ).setOrigin(0.5),
    );
    const startBtn = makeButton(this, 'НАЧАТЬ', () => {
      pop.close();
      this.locked = false;
      this.overlayOpen = false;
      sfx.play('swap');
      this.resetHintTimer();
    }, { w: 300, h: 72, style: 'green', font: 24 }).setPosition(0, boss ? 176 : 130);
    items.push(startBtn);
    pop.add(items);
  }
}
