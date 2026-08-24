// ============================================================
// MapScene — БЕСКОНЕЧНАЯ карта «Лестницы Бога».
//  - узлы создаются виртуализированно: по мере скролла вверх,
//    пройденные далеко позади — выгружаются (память не резиновая);
//  - drag/swipe + инерция + колесо мыши;
//  - эпохи (каждые 100 уровней) с табличками и новыми механиками;
//  - боссы каждый N-й уровень, после босса — сундук;
//  - параллакс-фон (пирамиды), божественные лучи, светлячки.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H, NODE_SPACING, THEME } from '../data/gameData';
import {
  getLevel,
  eraOf,
  nodePos,
  isBossLevel,
  chestForBossLevel,
  type ChestDef,
} from '../data/LevelFactory';
import { playerState } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';

const RUSSO = '"Russo One"';
const RUBIK = '"Rubik"';
const VIEW_AHEAD = 14; // сколько узлов строить впереди текущего
const PRUNE_BEHIND = 22; // сколько пройденных узлов держать позади

export class MapScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private bgFar!: Phaser.GameObjects.Container;
  private nodes = new Map<number, Phaser.GameObjects.Container>();
  private chestNodes = new Map<number, Phaser.GameObjects.Container>();
  private topBuilt = 0;
  private bottomBuilt = 1;
  private velocity = 0;
  private dragging = false;
  private moved = 0;
  private lastY = 0;

  constructor() {
    super('MapScene');
  }

  create(): void {
    this.velocity = 0;
    this.dragging = false;
    this.moved = 0;
    this.topBuilt = 0;
    this.bottomBuilt = 1;
    this.nodes.clear();
    this.chestNodes.clear();

    this.buildBackground();
    this.world = this.add.container(0, 0).setDepth(5);

    const cur = playerState.data.level;
    this.ensureBuilt(cur + VIEW_AHEAD);
    this.buildFireflies();
    this.buildInput();

    const p = nodePos(cur);
    this.cameras.main.setScroll(0, p.y - 480);

    this.events.on('focusLevel', this.onFocusLevel, this);
    this.events.on('refreshChests', this.onRefreshChests, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('focusLevel', this.onFocusLevel, this);
      this.events.off('refreshChests', this.onRefreshChests, this);
    });
  }

  // ---------------- Фон ----------------

  private buildBackground(): void {
    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x0e3322, 0x0e3322, 0x071a10, 0x071a10, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.fillStyle(0xf5b52e, 0.05);
    bg.fillCircle(GAME_W / 2, 130, 260);

    // божественные лучи
    const rays = this.add.container(GAME_W / 2, -160).setDepth(1);
    for (let i = 0; i < 3; i++) {
      const rg = this.add.graphics();
      rg.fillStyle(i % 2 === 0 ? 0xf5b52e : 0x9dffce, 0.05);
      const w = 150 + i * 70;
      rg.fillTriangle(-w / 2, 0, w / 2, 0, w * 0.16, 980 + i * 140);
      rg.setBlendMode(Phaser.BlendModes.ADD);
      rg.setPosition((i - 1) * 160, 0);
      rg.setRotation((i - 1) * 0.22);
      rays.add(rg);
    }
    this.tweens.add({
      targets: rays,
      angle: { from: -4, to: 4 },
      duration: 9000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // дальние ступенчатые пирамиды — параллакс-слой
    this.bgFar = this.add.container(0, 0).setDepth(2);
    for (let i = 0; i < 40; i++) {
      const t = this.add.graphics();
      const left = i % 2 === 0;
      const x = left ? 46 + (i % 4) * 18 : GAME_W - 46 - (i % 4) * 18;
      const y = -4000 + i * 470;
      t.fillStyle(i % 3 === 0 ? 0x0b2718 : 0x0d2c1b, 1);
      for (let s = 0; s < 4; s++) {
        const w = 120 - s * 26;
        t.fillRect(x - w / 2, y - s * 22, w, 22);
      }
      t.fillStyle(0xf5b52e, 0.06);
      t.fillRect(x - 8, y - 4 * 22, 16, 10);
      this.bgFar.add(t);
    }
    // виньетка
    this.add.image(GAME_W / 2, GAME_H / 2, 'vignette').setDepth(3).setAlpha(0.5);
  }

  private buildFireflies(): void {
    const layer = this.add.container(0, 0).setDepth(6);
    for (let i = 0; i < 14; i++) {
      const f = this.add.image(
        Phaser.Math.Between(20, GAME_W - 20),
        Phaser.Math.Between(140, GAME_H - 40),
        'glow',
      ).setScale(Phaser.Math.FloatBetween(0.05, 0.12)).setAlpha(0.5)
        .setTint(i % 3 === 0 ? 0x9dffce : 0xffd76a);
      layer.add(f);
      this.tweens.add({
        targets: f,
        x: f.x + Phaser.Math.Between(-60, 60),
        y: f.y + Phaser.Math.Between(-80, 40),
        alpha: { from: 0.15, to: 0.6 },
        duration: Phaser.Math.Between(2400, 5200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // ---------------- Виртуализированные узлы ----------------

  private ensureBuilt(target: number): void {
    while (this.topBuilt < target) {
      const id = ++this.topBuilt;
      this.buildNode(id);
    }
  }

  private buildNode(id: number): void {
    const cur = playerState.data.level;
    const def = getLevel(id);
    const p = nodePos(id);
    const done = id < cur;
    const current = id === cur;
    const locked = id > cur;
    const boss = def.type === 'boss';

    const node = this.add.container(p.x, p.y);

    // сегмент пути от предыдущего узла (рисуется в координатах этого контейнера)
    if (id > 1) {
      const a = nodePos(id - 1);
      const g = this.add.graphics();
      const passDone = id <= cur;
      const ax = a.x - p.x;
      const ay = a.y - p.y;
      const mx = ax * 0.5 + (id % 2 === 0 ? 34 : -34);
      const my = ay * 0.5;
      g.lineStyle(11, passDone ? 0xd9a52f : 0x1d4a2e, passDone ? 0.85 : 0.9);
      g.beginPath();
      g.moveTo(0, 0);
      for (let t = 0.1; t <= 1.001; t += 0.1) {
        const u = 1 - t;
        g.lineTo(u * u * 0 + 2 * u * t * mx + t * t * ax, u * u * 0 + 2 * u * t * my + t * t * ay);
      }
      g.strokePath();
      if (passDone) {
        g.lineStyle(3, 0xf5d78a, 0.5);
        g.strokePath();
      }
      node.add(g);
    }

    // табличка эпохи на первом уровне эпохи
    const era = eraOf(id);
    if (era.from === id) {
      const plate = this.add.container(270 - p.x, -104);
      const pg = this.add.graphics();
      pg.fillStyle(0x08190f, 0.92);
      pg.fillRoundedRect(-190, -34, 380, 68, 12);
      pg.lineStyle(2.5, 0xf5b52e, 0.9);
      pg.strokeRoundedRect(-190, -34, 380, 68, 12);
      plate.add(pg);
      plate.add(
        this.add.text(0, -18, `ЭПОХА ${era.numeral} · ${Math.min(id, 9999)}+`, {
          fontFamily: RUBIK, fontSize: '12px', color: '#ffd76a',
        }).setOrigin(0.5),
      );
      plate.add(
        this.add.text(0, 6, era.title, {
          fontFamily: RUSSO, fontSize: '21px', color: '#f9ecc8',
        }).setOrigin(0.5),
      );
      plate.add(
        this.add.text(0, 24, era.from === 1 ? 'Начало бесконечной Лестницы' : era.mechanicText, {
          fontFamily: RUBIK, fontSize: '10.5px', color: '#8fd8b4',
        }).setOrigin(0.5),
      );
      node.add(plate);
    }

    // сам узел
    const g = this.add.graphics();
    if (current) {
      const glow = this.add.image(0, 0, 'glow').setTint(0xf5b52e).setScale(1.5).setAlpha(0.6);
      node.add(glow);
      this.tweens.add({
        targets: glow,
        scale: { from: 1.35, to: 1.7 },
        alpha: { from: 0.45, to: 0.75 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    if (locked) {
      g.fillStyle(0x10281b, 1);
      g.fillCircle(0, 0, 33);
      g.lineStyle(3, 0x2c5a40, 1);
      g.strokeCircle(0, 0, 33);
      // замок
      g.fillStyle(0x2c5a40, 1);
      g.fillRoundedRect(-9, -3, 18, 15, 3);
      g.lineStyle(3.5, 0x2c5a40, 1);
      g.beginPath();
      g.arc(0, -3, 7, Math.PI, Math.PI * 2);
      g.strokePath();
    } else if (boss) {
      g.fillStyle(0x4a120c, 1);
      g.fillCircle(0, 0, 40);
      g.lineStyle(4, current ? 0xf5b52e : done ? 0xd9a52f : 0x8f2015, 1);
      g.strokeCircle(0, 0, 40);
      node.add(g);
      node.add(this.add.image(0, -2, 'skull').setScale(0.55).setAlpha(done ? 0.75 : 1));
    } else {
      g.fillStyle(done ? 0x1d4a2e : 0x123626, 1);
      g.fillCircle(0, 0, 34);
      g.lineStyle(4, current ? 0xf5b52e : 0x2ee6a8, done ? 0.9 : 1);
      g.strokeCircle(0, 0, 34);
      if (done) {
        g.lineStyle(2, 0xf5d78a, 0.5);
        g.strokeCircle(0, 0, 28);
      }
    }
    node.add(g);

    if (!boss || locked) {
      node.add(
        this.add.text(0, 1, String(id), {
          fontFamily: RUSSO,
          fontSize: locked ? '16px' : '19px',
          color: locked ? '#3f6a52' : '#f9ecc8',
        }).setOrigin(0.5),
      );
    } else if (boss && !locked) {
      node.add(
        this.add.text(0, 22, String(id), {
          fontFamily: RUSSO, fontSize: '13px', color: '#ffb3a0',
        }).setOrigin(0.5),
      );
    }

    // звёзды под пройденным узлом
    if (done) {
      const stars = playerState.starsOf(id);
      for (let i = 0; i < 3; i++) {
        node.add(
          this.add.image((i - 1) * 17, 47, 'star')
            .setScale(0.3)
            .setTint(i < stars ? 0xffd76a : 0x24402f),
        );
      }
    }

    // интерактив
    const hit = this.add.circle(0, 0, 46, 0x000000, 0).setInteractive({ useHandCursor: !locked });
    hit.on('pointerup', () => {
      if (this.moved > 12) return;
      if (locked) {
        sfx.play('invalid');
        this.scene.get('UIScene')?.events.emit('toast', 'Ступень закрыта — пройди предыдущую');
        this.tweens.add({ targets: node, x: { from: p.x - 5, to: p.x }, duration: 60, yoyo: true, repeat: 3 });
        return;
      }
      sfx.play('click');
      this.scene.get('UIScene')?.events.emit('openLevel', def);
    });
    node.add(hit);

    // сундук после босса
    if (boss) {
      this.buildChest(id, node);
    }

    this.world.add(node);
    this.nodes.set(id, node);
  }

  private buildChest(bossLevel: number, bossNode: Phaser.GameObjects.Container): void {
    const chest = chestForBossLevel(bossLevel);
    const side = bossLevel % 2 === 0 ? 1 : -1;
    const c = this.add.container(side * 104, 6);
    const spr = this.add.image(0, 0, 'chest').setScale(0.6);
    c.add(spr);
    this.tweens.add({
      targets: c,
      y: { from: 2, to: 12 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const hit = this.add.circle(0, 0, 42, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (this.moved > 12) return;
      if (playerState.data.level <= bossLevel) {
        sfx.play('invalid');
        this.scene.get('UIScene')?.events.emit('toast', 'Сначала победи босса этой ступени');
        return;
      }
      if (playerState.chestClaimed(chest.id)) {
        sfx.play('tap');
        this.scene.get('UIScene')?.events.emit('toast', 'Этот сундук уже открыт');
        return;
      }
      sfx.play('chest');
      this.scene.get('UIScene')?.events.emit('openChest', chest);
    });
    c.add(hit);
    bossNode.add(c);
    this.chestNodes.set(bossLevel, c);
    this.applyChestState(c, bossLevel);
  }

  private applyChestState(c: Phaser.GameObjects.Container, bossLevel: number): void {
    const claimed = playerState.chestClaimed(`chest_${bossLevel}`);
    const unlocked = playerState.data.level > bossLevel;
    const spr = c.list[0] as Phaser.GameObjects.Image;
    c.list.forEach((o) => {
      const img = o as Phaser.GameObjects.Image;
      if (img.setTint) {
        if (claimed) img.setTint(0x5a7263).setAlpha(0.55);
        else if (!unlocked) img.setTint(0x77917f).setAlpha(0.7);
        else img.clearTint().setAlpha(1);
      }
    });
    if (spr && !claimed && unlocked) {
      this.tweens.add({
        targets: spr,
        scale: { from: 0.6, to: 0.68 },
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private onRefreshChests(): void {
    this.chestNodes.forEach((c, bossLevel) => this.applyChestState(c, bossLevel));
  }

  private onFocusLevel(id: number): void {
    this.ensureBuilt(id + VIEW_AHEAD);
    const p = nodePos(id);
    this.tweens.add({
      targets: this.cameras.main,
      scrollY: p.y - 480,
      duration: 550,
      ease: 'Cubic.easeInOut',
    });
  }

  // ---------------- Ввод ----------------

  private buildInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.moved = 0;
      this.velocity = 0;
      this.lastY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const dy = p.y - this.lastY;
      this.lastY = p.y;
      this.moved += Math.abs(dy);
      this.velocity = dy;
      const cam = this.cameras.main;
      cam.setScroll(0, cam.scrollY + dy);
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setScroll(0, cam.scrollY + dy * 0.55);
    });
  }

  // ---------------- Обновление ----------------

  update(_time: number, delta: number): void {
    const cam = this.cameras.main;

    // инерция
    if (!this.dragging && Math.abs(this.velocity) > 0.35) {
      cam.setScroll(0, cam.scrollY + this.velocity * (delta / 16.6));
      this.velocity *= 0.93;
    } else if (!this.dragging) {
      this.velocity = 0;
    }

    this.clampAndExtend();

    // параллакс дальнего слоя
    this.bgFar.y = -cam.scrollY * 0.14;
  }

  private clampAndExtend(): void {
    const cam = this.cameras.main;
    const minY = -(this.topBuilt - 1) * NODE_SPACING - 780;
    const maxY = -(this.bottomBuilt - 1) * NODE_SPACING - 300;
    if (cam.scrollY < minY) {
      cam.setScroll(0, minY);
      this.velocity = 0;
    }
    if (cam.scrollY > maxY) {
      cam.setScroll(0, maxY);
      this.velocity = 0;
    }
    // строим вперёд, когда игрок приближается к верхнему краю
    if (cam.scrollY < minY + 1300) {
      this.ensureBuilt(this.topBuilt + 10);
    }
    // выгружаем далеко пройденное
    const cur = playerState.data.level;
    while (this.bottomBuilt < cur - PRUNE_BEHIND && this.bottomBuilt < this.topBuilt) {
      const old = this.nodes.get(this.bottomBuilt);
      if (old) {
        old.destroy();
        this.nodes.delete(this.bottomBuilt);
      }
      const chest = this.chestNodes.get(this.bottomBuilt);
      if (chest) this.chestNodes.delete(this.bottomBuilt); // уничтожится вместе с узлом
      this.bottomBuilt++;
    }
  }
}

export type { ChestDef };
