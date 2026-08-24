// ============================================================
// GameScene: ядро match-3.
//  - поле 7×8, 6 видов самоцветов (процедурные текстуры);
//  - свайп или тап-тап для обмена, только валидные ходы;
//  - каскады, комбо-множитель, бонусы за 4/5 в ряд;
//  - цели: очки или сбор самоцветов; боссы с полосой HP;
//  - звёзды, награды (x2 при активном бусте), жизни;
//  - пауза, победа/поражение, подсказка при бездействии,
//    перемешивание при отсутствии ходов.
// ============================================================
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  GEM_KINDS,
  GEM_COLORS,
  getLevels,
  type LevelDef,
  type GemKind,
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

interface GemObj {
  kind: GemKind;
  sprite: Phaser.GameObjects.Image;
  r: number;
  c: number;
}
interface CellPos {
  r: number;
  c: number;
}
interface MatchGroup {
  kind: GemKind;
  cells: CellPos[];
}

export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private grid: (GemObj | null)[][] = [];
  private board!: Phaser.GameObjects.Container;
  private moves = 0;
  private score = 0;
  private collected = 0;
  private locked = true;
  private overlayOpen = true;
  private selected: GemObj | null = null;
  private ring!: Phaser.GameObjects.Image;
  private downGem: GemObj | null = null;
  private downX = 0;
  private downY = 0;
  private dragged = false;
  private hintTimer?: Phaser.Time.TimerEvent;
  private lifeLost = false;

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

  create(data?: { levelId?: number }): void {
    const id = Phaser.Math.Clamp(data?.levelId ?? playerState.data.level, 1, 24);
    this.level = getLevels().find((l) => l.id === id)!;
    this.moves = this.level.moves;
    this.score = 0;
    this.collected = 0;
    this.locked = true;
    this.overlayOpen = true;
    this.selected = null;
    this.downGem = null;
    this.lifeLost = false;
    this.bossMax = this.level.goal.type === 'collect' ? this.level.goal.amount : 1;

    this.buildBackground();
    this.buildHUD();
    this.board = this.add.container(0, 0).setDepth(10);
    this.ring = this.add.image(0, 0, 'ring').setDepth(12).setVisible(false);
    this.genBoard();
    this.buildInput();
    this.showStartOverlay();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hintTimer?.destroy();
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
    // панель поля
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
    // клетки
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
      this.add.text(GAME_W / 2, 26, `УРОВЕНЬ ${this.level.id}`, {
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
    hud.add(
      this.add.text(26, 88, 'ОЧКИ', { fontFamily: RUBIK, fontSize: '11px', color: '#8fd8b4' }),
    );
    this.scoreText = this.add.text(26, 104, '0', {
      fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8',
    });
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
      hud.add(this.add.image(296, 106, `gem_${this.level.goal.kind}`).setScale(0.34));
    } else {
      hud.add(this.add.image(296, 106, 'trophy').setScale(0.6));
    }
    this.goalText = this.add.text(394, 107, '', {
      fontFamily: RUSSO, fontSize: '17px', color: '#f9ecc8',
    }).setOrigin(0.5);
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
      this.add.text(GAME_W / 2, 806, 'Меняй самоцветы местами — собирай 3 в ряд', {
        fontFamily: RUBIK, fontSize: '13px', color: '#71806f',
      }).setOrigin(0.5),
    );
    this.updateHUD();
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
    if (g.type === 'collect') {
      this.goalText.setText(`${Math.min(this.collected, g.amount)} / ${g.amount}`);
    } else {
      this.goalText.setText(`${fmtNum(this.score)} / ${fmtNum(g.amount)}`);
    }
    // полоса звёзд
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

  private randomKind(): GemKind {
    return GEM_KINDS[Math.floor(Math.random() * GEM_KINDS.length)];
  }

  /** Сгенерировать поле без стартовых совпадений и с доступным ходом. */
  private genBoard(): void {
    let kinds: GemKind[][] = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      kinds = [];
      for (let r = 0; r < ROWS; r++) {
        const row: GemKind[] = [];
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
      const row: (GemObj | null)[] = [];
      for (let c = 0; c < COLS; c++) {
        const kind = kinds[r][c];
        const { x, y } = this.gemXY(r, c);
        const sprite = this.add.image(x, y - 600 - Math.random() * 240, `gem_${kind}`).setScale(0.6);
        this.board.add(sprite);
        row.push({ kind, sprite, r, c });
      }
      this.grid.push(row);
    }
    // стартовое падение
    this.grid.flat().forEach((gem) => {
      if (!gem) return;
      const { y } = this.gemXY(gem.r, gem.c);
      this.tweens.add({
        targets: gem.sprite,
        y,
        duration: 420 + gem.r * 45,
        delay: gem.c * 22,
        ease: 'Bounce.easeOut',
      });
    });
  }

  private kindGridHasMove(kinds: GemKind[][]): boolean {
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
    // горизонтали
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
    // вертикали
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
    // группировка BFS
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
      if (this.locked) return;
      this.downX = p.x;
      this.downY = p.y;
      this.downGem = this.gemAt(p.x, p.y);
      this.dragged = false;
      this.resetHintTimer();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.locked || !this.downGem || this.dragged) return;
      const dx = p.x - this.downX;
      const dy = p.y - this.downY;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      this.dragged = true;
      const src = this.downGem;
      this.downGem = null;
      let tr = src.r;
      let tc = src.c;
      if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
      else tr += dy > 0 ? 1 : -1;
      const target = tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS ? this.grid[tr][tc] : null;
      this.clearSelection();
      if (target) void this.trySwap(src, target);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.locked || this.dragged) {
        this.downGem = null;
        return;
      }
      this.downGem = null;
      const g = this.gemAt(p.x, p.y);
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

  private gemAt(x: number, y: number): GemObj | null {
    const c = Math.floor((x - BOARD_X) / CELL);
    const r = Math.floor((y - BOARD_Y) / CELL);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return this.grid[r][c];
  }

  private select(g: GemObj): void {
    this.clearSelection();
    this.selected = g;
    sfx.play('tap');
    g.sprite.setScale(0.68);
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
    if (this.selected) this.selected.sprite.setScale(0.6);
    this.selected = null;
  }

  // ---------------- Обмен и каскады ----------------

  private swapInGrid(a: GemObj, b: GemObj): void {
    this.grid[a.r][a.c] = b;
    this.grid[b.r][b.c] = a;
    const ar = a.r;
    const ac = a.c;
    a.r = b.r;
    a.c = b.c;
    b.r = ar;
    b.c = ac;
  }

  private tweenSwap(a: GemObj, b: GemObj): Promise<void> {
    const pa = this.gemXY(a.r, a.c);
    const pb = this.gemXY(b.r, b.c);
    return new Promise((resolve) => {
      this.tweens.add({
        targets: a.sprite,
        x: pa.x,
        y: pa.y,
        duration: 140,
        ease: 'Cubic.easeOut',
      });
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

  private async trySwap(a: GemObj, b: GemObj): Promise<void> {
    if (this.locked) return;
    this.locked = true;
    this.clearSelection();
    this.resetHintTimer();
    sfx.play('swap');
    sfx.vibrate('light');
    this.swapInGrid(a, b);
    await this.tweenSwap(a, b);
    if (!this.scene.isActive('GameScene')) return;

    if (this.findMatches().length === 0) {
      sfx.play('invalid');
      this.swapInGrid(a, b);
      await this.tweenSwap(a, b);
      this.tweens.add({
        targets: [a.sprite, b.sprite],
        x: '-=6',
        duration: 50,
        yoyo: true,
        repeat: 2,
      });
      this.locked = false;
      this.resetHintTimer();
      return;
    }

    this.moves--;
    this.updateHUD();
    await this.resolveBoard();
  }

  private async resolveBoard(): Promise<void> {
    let chain = 0;
    while (this.scene.isActive('GameScene')) {
      const groups = this.findMatches();
      if (groups.length === 0) break;
      chain++;
      if (chain >= 2) this.showChainText(chain);
      for (const grp of groups) {
        await this.popGroup(grp, chain);
        if (!this.scene.isActive('GameScene')) return;
      }
      await this.collapse();
    }
    if (!this.scene.isActive('GameScene')) return;

    this.updateHUD();
    if (this.goalMet()) {
      await this.winSequence();
      return;
    }
    if (this.moves <= 0) {
      this.loseSequence();
      return;
    }
    if (!this.findMove()) {
      await this.shuffleBoard();
    }
    this.locked = false;
    this.resetHintTimer();
  }

  private async popGroup(grp: MatchGroup, chain: number): Promise<void> {
    const n = grp.cells.length;
    const bonus = n === 4 ? 60 : n >= 5 ? 150 : 0;
    const gained = (n * 20 + bonus) * chain;
    this.score += gained;

    if (this.level.goal.type === 'collect' && this.level.goal.kind === grp.kind) {
      this.collected += n;
      if (this.level.type === 'boss' && this.bossSprite) {
        this.tweens.add({
          targets: this.bossSprite,
          x: { from: 60, to: 66 },
          duration: 55,
          yoyo: true,
          repeat: 3,
        });
        sfx.vibrate('medium');
      }
    }

    let cx = 0;
    let cy = 0;
    const color = GEM_COLORS[grp.kind];
    grp.cells.forEach(({ r, c }) => {
      const gem = this.grid[r][c];
      this.grid[r][c] = null;
      if (!gem) return;
      const { x, y } = this.gemXY(r, c);
      cx += x;
      cy += y;
      const em = this.add.particles(x, y, 'spark', {
        speed: { min: 60, max: 260 },
        scale: { start: 0.55, end: 0 },
        lifespan: 430,
        tint: color.light,
        gravityY: 180,
        emitting: false,
      }).setDepth(20);
      em.explode(7);
      this.time.delayedCall(700, () => em.destroy());
      this.tweens.add({
        targets: gem.sprite,
        scale: 0.85,
        alpha: 0,
        duration: 150,
        ease: 'Quad.easeIn',
        onComplete: () => gem.sprite.destroy(),
      });
    });
    cx /= n;
    cy /= n;

    this.floatText(cx, cy - 10, `+${gained}`, chain >= 2 ? '#9dffce' : '#ffd76a', 17 + Math.min(chain, 4) * 2);
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
    await this.sleep(165);
  }

  private moveGem(gem: GemObj): Promise<void> {
    const { x, y } = this.gemXY(gem.r, gem.c);
    const dist = Math.abs(y - gem.sprite.y) / CELL;
    return new Promise((resolve) => {
      this.tweens.add({
        targets: gem.sprite,
        x,
        y,
        duration: 110 + dist * 35,
        ease: 'Cubic.easeIn',
        onComplete: () => resolve(),
      });
    });
  }

  private async collapse(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const gem = this.grid[r][c];
        if (gem) {
          if (write !== r) {
            this.grid[write][c] = gem;
            this.grid[r][c] = null;
            gem.r = write;
            promises.push(this.moveGem(gem));
          }
          write--;
        }
      }
      const empties = write + 1;
      for (let k = 0; k < empties; k++) {
        const kind = this.randomKind();
        const { x, y } = this.gemXY(k, c);
        const sprite = this.add.image(x, y - empties * CELL - 20, `gem_${kind}`).setScale(0.6);
        this.board.add(sprite);
        const gem: GemObj = { kind, sprite, r: k, c };
        this.grid[k][c] = gem;
        promises.push(this.moveGem(gem));
      }
    }
    if (promises.length) {
      sfx.play('fall');
      await Promise.all(promises);
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
    return g.type === 'collect' ? this.collected >= g.amount : this.score >= g.amount;
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

    const stars = this.starCount();
    const boost = playerState.boostActive('coins2x');
    const coins = this.level.rewardCoins * (boost ? 2 : 1);
    playerState.completeLevel(this.level.id, stars, coins, this.level.rewardGems);

    await this.sleep(800);
    if (!this.scene.isActive('GameScene')) return;
    this.showWinOverlay(stars, coins, boost);
  }

  private showWinOverlay(stars: number, coins: number, boost: boolean): void {
    const pop = new Popup(this, 460, 560);
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];

    const title = this.add.text(0, -200, 'ПОБЕДА!', {
      fontFamily: RUSSO, fontSize: '42px', color: '#f5b52e',
    }).setOrigin(0.5).setShadow(0, 4, '#000000', 8);
    items.push(title);

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
      items.push(
        this.add.text(44, 7, 'x2', { fontFamily: RUSSO, fontSize: '16px', color: '#ffd76a' }).setOrigin(0, 0.5),
      );
    }
    if (this.level.rewardGems > 0) {
      items.push(
        this.add.image(100, 6, 'gemIcon').setScale(0.72),
        this.add.text(132, 7, `+${this.level.rewardGems}`, { fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8' }).setOrigin(0, 0.5),
      );
    }

    if (this.level.id < 24) {
      items.push(
        makeButton(this, 'СЛЕДУЮЩИЙ УРОВЕНЬ', () => {
          this.scene.restart({ levelId: this.level.id + 1 });
        }, { w: 360, h: 72, style: 'green', font: 20 }).setPosition(0, 108),
      );
    } else {
      items.push(
        this.add.text(0, 104, 'Ты прошёл все уровни! Сокровища Монтесумы твои!', {
          fontFamily: RUBIK, fontSize: '16px', fontStyle: 'bold', color: '#9dffce',
          wordWrap: { width: 380 }, align: 'center',
        }).setOrigin(0.5),
      );
    }
    items.push(
      makeButton(this, 'НА КАРТУ', () => this.exitToMap(), { w: 360, h: 60, style: 'dark', font: 17 }).setPosition(0, 196),
    );
    pop.add(items);
  }

  private loseSequence(): void {
    this.locked = true;
    this.overlayOpen = true;
    sfx.play('lose');
    sfx.vibrate('heavy');
    this.cameras.main.flash(300, 130, 30, 30);
    if (!this.lifeLost) {
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
      this.add.text(0, -60, '-1 жизнь. Боги ждут реванша!', {
        fontFamily: RUBIK, fontSize: '14px', color: '#b9ad87',
      }).setOrigin(0.5),
    );
    items.push(
      makeButton(this, 'ПОВТОРИТЬ', () => {
        if (playerState.livesNow() > 0) {
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

  // ---------------- Стартовый оверлей ----------------

  private showStartOverlay(): void {
    const pop = new Popup(this, 440, 470, `УРОВЕНЬ ${this.level.id}`);
    pop.closable = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    const boss = this.level.type === 'boss';
    items.push(
      this.add.text(0, boss ? -160 : -150, this.level.name, {
        fontFamily: RUBIK, fontSize: '16px', fontStyle: 'bold', color: '#b9ad87',
      }).setOrigin(0.5),
    );
    if (boss) {
      items.push(this.add.image(0, -100, 'skull').setScale(1.1));
      items.push(
        this.add.text(0, -50, `Победи: ${this.level.bossName}`, {
          fontFamily: RUSSO, fontSize: '15px', color: '#ff8a76',
        }).setOrigin(0.5),
      );
    }
    const goalStr =
      this.level.goal.type === 'collect'
        ? `Собери ${this.level.goal.amount} самоцветов`
        : `Набери ${fmtNum(this.level.goal.amount)} очков`;
    items.push(
      this.add.text(0, boss ? -14 : -100, `Цель: ${goalStr}`, {
        fontFamily: RUBIK, fontSize: '17px', fontStyle: 'bold', color: '#f9ecc8',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, boss ? 22 : -62, `Ходы: ${this.level.moves}`, {
        fontFamily: RUSSO, fontSize: '18px', color: '#9dffce',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, boss ? 66 : -10, 'Тяни самоцвет в сторону соседа\nили коснись двух соседних по очереди', {
        fontFamily: RUBIK, fontSize: '13.5px', color: '#8fd8b4', align: 'center',
      }).setOrigin(0.5),
    );
    const startBtn = makeButton(this, 'НАЧАТЬ', () => {
      pop.close();
      this.locked = false;
      this.overlayOpen = false;
      sfx.play('swap');
      this.resetHintTimer();
    }, { w: 300, h: 72, style: 'green', font: 24 }).setPosition(0, 140);
    items.push(startBtn);
    pop.add(items);
  }
}
