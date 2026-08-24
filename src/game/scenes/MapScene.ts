// ============================================================
// MapScene: бесконечная карта-лестница.
//  - виртуализация: узлы создаются по мере скролла и удаляются
//    за экраном (иначе сотни уровней повесят память);
//  - drag/swipe с инерцией + колесо мыши;
//  - змейка-путь, эпохи-таблички, боссы с черепами, сундуки
//    после боссов, параллакс-фон и светлячки.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H, NODE_SPACING } from '../data/gameData';
import { getLevel, nodePos, chestForBossLevel, eraOf, ERAS } from '../data/LevelFactory';
import { playerState } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';

const RUSSO = '"Russo One"';
const RUBIK = '"Rubik"';

interface MapNode {
  id: number;
  container: Phaser.GameObjects.Container;
  segment?: Phaser.GameObjects.Graphics;
  pulse?: Phaser.Tweens.Tween;
  y: number;
}

export class MapScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private bgLayer!: Phaser.GameObjects.Container;
  private nodes = new Map<number, MapNode>();
  private lastY = 0;
  private velocity = 0;
  private dragging = false;
  private moved = 0;

  constructor() {
    super('MapScene');
  }

  create(): void {
    this.buildBackground();
    this.world = this.add.container(0, 0);
    this.buildAmbient();

    const cur = playerState.data.level;
    this.cameras.main.setBounds(-1000, -((cur + 6) * NODE_SPACING), GAME_W + 2000, (cur + 8) * NODE_SPACING + GAME_H);
    this.cameras.main.setScroll(0, nodePos(cur).y - GAME_H * 0.62);

    this.bindInput();
    this.events.on('focusLevel', this.onFocusLevel, this);
    this.events.on('refreshChests', this.onRefreshChests, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('focusLevel', this.onFocusLevel, this);
      this.events.off('refreshChests', this.onRefreshChests, this);
    });
  }

  // ---------------- Фон ----------------

  private buildBackground(): void {
    this.bgLayer = this.add.container(0, 0).setDepth(-2);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0e2f1d, 0x0e2f1d, 0x061410, 0x061410, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.fillStyle(0xf5b52e, 0.06);
    bg.fillCircle(GAME_W / 2, 120, 260);
    // силуэты пирамид по бокам
    bg.fillStyle(0x0a2416, 1);
    for (let i = 0; i < 6; i++) {
      const x = (i % 2 === 0 ? 30 : GAME_W - 30) + (i % 3) * 8;
      const y = 120 + i * 170;
      bg.beginPath();
      bg.moveTo(x - 60, y + 90);
      bg.lineTo(x, y - 30);
      bg.lineTo(x + 60, y + 90);
      bg.closePath();
      bg.fillPath();
    }
    // руны
    for (let i = 0; i < 26; i++) {
      bg.fillStyle(i % 2 ? 0xf5b52e : 0x2ee6a8, 0.07);
      bg.fillRect(Phaser.Math.Between(6, GAME_W - 14), Phaser.Math.Between(20, GAME_H - 20), 8, 8);
    }
    this.bgLayer.add(bg);
  }

  private buildAmbient(): void {
    // божественные лучи (покачиваются)
    const rays = this.add.container(GAME_W / 2, -160).setDepth(-1);
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

    // светлячки (экранный слой)
    this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        const p = this.add
          .particles(Phaser.Math.Between(20, GAME_W - 20), Phaser.Math.Between(80, GAME_H - 40), 'spark', {
            speed: { min: 8, max: 36 },
            angle: { min: 250, max: 290 },
            scale: { start: 0.3, end: 0 },
            lifespan: 1800,
            tint: [0xffd76a, 0x9dffce],
            emitting: false,
          })
          .setDepth(50);
        p.explode(1);
        this.time.delayedCall(1900, () => p.destroy());
      },
    });
  }

  // ---------------- Ввод ----------------

  private bindInput(): void {
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
      cam.setScroll(0, Phaser.Math.Clamp(cam.scrollY + dy, this.minScroll(), this.maxScroll()));
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setScroll(0, Phaser.Math.Clamp(cam.scrollY + dy * 0.6, this.minScroll(), this.maxScroll()));
    });
  }

  private maxScroll(): number {
    return 60;
  }

  private minScroll(): number {
    return -((playerState.data.level + 4) * NODE_SPACING);
  }

  update(_t: number, dt: number): void {
    // инерция
    if (!this.dragging && Math.abs(this.velocity) > 0.5) {
      const cam = this.cameras.main;
      cam.setScroll(0, Phaser.Math.Clamp(cam.scrollY + this.velocity, this.minScroll(), this.maxScroll()));
      this.velocity *= Math.pow(0.9, dt / 16.6);
      if (Math.abs(this.velocity) <= 0.5) this.velocity = 0;
    }
    this.ensureNodes();
    // параллакс фона
    this.bgLayer.y = -this.cameras.main.scrollY * 0.12;
  }

  // ---------------- Виртуализация узлов ----------------

  private ensureNodes(): void {
    const cam = this.cameras.main;
    const top = cam.scrollY - 200;
    const bottom = cam.scrollY + GAME_H + 200;
    const cur = playerState.data.level;

    const first = Math.max(1, Math.floor(-bottom / NODE_SPACING) + 1);
    const last = Math.min(cur + 3, Math.ceil(-top / NODE_SPACING) + 1);

    for (let id = first; id <= last; id++) {
      if (!this.nodes.has(id)) this.spawnNode(id);
    }
    this.nodes.forEach((node, id) => {
      if (id < first || id > last) {
        node.container.destroy();
        node.segment?.destroy();
        node.pulse?.stop();
        this.nodes.delete(id);
      }
    });
  }

  private spawnNode(id: number): void {
    const def = getLevel(id);
    const pos = nodePos(id);
    const cur = playerState.data.level;
    const state: 'done' | 'current' | 'locked' = id < cur ? 'done' : id === cur ? 'current' : 'locked';
    const boss = def.type === 'boss';

    // сегмент пути от предыдущего узла
    let segment: Phaser.GameObjects.Graphics | undefined;
    if (id > 1) {
      const prev = nodePos(id - 1);
      segment = this.add.graphics();
      segment.lineStyle(10, 0x3c2c10, 0.9);
      segment.lineBetween(prev.x, prev.y, pos.x, pos.y);
      segment.lineStyle(5, 0x8a6a30, 0.9);
      segment.lineBetween(prev.x, prev.y, pos.x, pos.y);
      segment.setDepth(1);
      this.world.add(segment);
    }

    const c = this.add.container(pos.x, pos.y).setDepth(5);
    const glowImg = this.add.image(0, 0, 'glow');

    const body = this.add.graphics();
    if (state === 'locked') {
      body.fillStyle(0x1c2a22, 1);
      body.fillCircle(0, 0, 30);
      body.lineStyle(4, 0x35443b, 1);
      body.strokeCircle(0, 0, 29);
      // замок
      body.fillStyle(0x5a6a60, 1);
      body.fillRoundedRect(-9, -4, 18, 14, 3);
      body.lineStyle(3.5, 0x5a6a60, 1);
      body.beginPath();
      body.arc(0, -5, 7, Math.PI, 0);
      body.strokePath();
    } else if (boss) {
      body.fillGradientStyle(0x7e2418, 0x7e2418, 0x4a0f08, 0x4a0f08, 1);
      body.fillCircle(0, 0, 38);
      body.lineStyle(4.5, 0xf5b52e, 1);
      body.strokeCircle(0, 0, 36);
      body.lineStyle(2, 0xffd76a, 0.5);
      body.strokeCircle(0, 0, 30);
    } else if (state === 'current') {
      body.fillGradientStyle(0xffd76a, 0xffd76a, 0xee9d12, 0xee9d12, 1);
      body.fillCircle(0, 0, 34);
      body.lineStyle(4.5, 0x8a5a08, 1);
      body.strokeCircle(0, 0, 32);
    } else {
      body.fillGradientStyle(0x2c7a52, 0x2c7a52, 0x14432a, 0x14432a, 1);
      body.fillCircle(0, 0, 30);
      body.lineStyle(4, 0xf5b52e, 0.9);
      body.strokeCircle(0, 0, 29);
    }
    c.add([glowImg, body]);

    if (boss && state !== 'locked') {
      c.add(this.add.image(0, 0, 'skull').setScale(0.52));
    }

    // номер / звёзды
    if (state === 'locked') {
      c.add(this.add.text(0, 44, `${id}`, { fontFamily: RUSSO, fontSize: '12px', color: '#5a6a60' }).setOrigin(0.5));
    } else {
      c.add(
        this.add
          .text(0, boss ? 50 : 44, `${id}`, {
            fontFamily: RUSSO,
            fontSize: boss ? '14px' : '13px',
            color: state === 'current' ? '#241a05' : '#f9ecc8',
          })
          .setOrigin(0.5)
          .setDepth(2),
      );
      if (state === 'done' || (state === 'current' && false)) {
        const stars = playerState.starsOf(id);
        for (let i = 0; i < 3; i++) {
          c.add(
            this.add
              .image((i - 1) * 15, boss ? -48 : -42, 'star')
              .setScale(0.26)
              .setTint(stars > i ? 0xffd76a : 0x33413a)
              .setDepth(2),
          );
        }
      }
    }

    // текущий уровень — пульсация и вращающееся кольцо
    let pulse: Phaser.Tweens.Tween | undefined;
    if (state === 'current') {
      glowImg.setTint(0xffd76a).setScale(1.5).setAlpha(0.85);
      pulse = this.tweens.add({
        targets: glowImg,
        scale: { from: 1.3, to: 1.9 },
        alpha: { from: 0.85, to: 0.25 },
        duration: 750,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      const arrow = this.add
        .text(0, -62, '▼ ТЫ ЗДЕСЬ', { fontFamily: RUSSO, fontSize: '12px', color: '#ffd76a' })
        .setOrigin(0.5);
      this.tweens.add({ targets: arrow, y: -56, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      c.add(arrow);
    } else {
      glowImg.setTint(boss ? 0xff6a4a : 0x2ee6a8).setScale(state === 'locked' ? 0 : 1).setAlpha(state === 'locked' ? 0 : 0.5);
    }

    // интерактив
    if (state !== 'locked') {
      const hit = this.add.circle(0, 0, boss ? 42 : 36, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (this.moved > 14) return; // это был скролл
        sfx.play('tap');
        this.scene.get('UIScene')?.events.emit('openLevel', id);
      });
      c.add(hit);
    }

    this.world.add(c);

    // табличка эпохи на первом уровне эпохи
    if (((id - 1) % 100) === 0) {
      const era = eraOf(id);
      const plate = this.add.container(GAME_W / 2, pos.y - 84).setDepth(4);
      const pg = this.add.graphics();
      pg.fillStyle(0x08190f, 0.92);
      pg.fillRoundedRect(-130, -26, 260, 52, 10);
      pg.lineStyle(2.5, 0xd9a52f, 0.9);
      pg.strokeRoundedRect(-130, -26, 260, 52, 10);
      plate.add(pg);
      plate.add(
        this.add.text(0, -12, `ЭПОХА ${era.numeral} · ${era.title}`, {
          fontFamily: RUSSO, fontSize: '12px', color: '#f5b52e',
        }).setOrigin(0.5),
      );
      plate.add(
        this.add.text(0, 8, `ступени ${era.from}–${era.to}`, {
          fontFamily: RUBIK, fontSize: '10.5px', color: '#8fd8b4',
        }).setOrigin(0.5),
      );
      this.world.add(plate);
    }

    this.nodes.set(id, { id, container: c, segment, pulse, y: pos.y });
    this.maybeSpawnChest(id);
  }

  // ---------------- Сундуки ----------------

  private chestLayer!: Phaser.GameObjects.Container;

  private onRefreshChests(): void {
    if (this.chestLayer) this.chestLayer.removeAll(true);
    this.chestLayer = this.add.container(0, 0).setDepth(6);
    this.world.add(this.chestLayer);
    this.nodes.forEach((_, id) => this.maybeSpawnChest(id));
  }

  private maybeSpawnChest(bossId: number): void {
    if (getLevel(bossId).type !== 'boss') return;
    if (!this.chestLayer) {
      this.chestLayer = this.add.container(0, 0).setDepth(6);
      this.world.add(this.chestLayer);
    }
    const chest = chestForBossLevel(bossId);
    if (playerState.data.level < bossId) return; // сундук появится после победы над боссом
    if (this.chestLayer.getAll().some((o) => (o as Phaser.GameObjects.Container).name === chest.id)) return;

    const pos = nodePos(bossId);
    const side = pos.x > GAME_W / 2 ? -1 : 1;
    const cc = this.add.container(pos.x + side * 108, pos.y - 44).setDepth(6);
    cc.name = chest.id;
    const claimed = playerState.chestClaimed(chest.id);
    const spr = this.add.image(0, 0, 'chest').setScale(claimed ? 0.42 : 0.5).setAlpha(claimed ? 0.55 : 1);
    cc.add(spr);
    if (!claimed) {
      const gl = this.add.image(0, 0, 'glow').setTint(0xf5b52e).setScale(0.9).setAlpha(0.6);
      cc.add(gl);
      this.tweens.add({ targets: gl, alpha: { from: 0.25, to: 0.7 }, duration: 650, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: spr, angle: { from: -4, to: 4 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const hit = this.add.circle(0, 0, 40, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (this.moved > 14) return;
        sfx.play('tap');
        this.scene.get('UIScene')?.events.emit('openChest', chest);
      });
      cc.add(hit);
    }
    this.chestLayer.add(cc);
  }

  // ---------------- События ----------------

  private onFocusLevel(id: number): void {
    const target = nodePos(id).y - GAME_H * 0.62;
    const cam = this.cameras.main;
    this.cameras.main.setBounds(-1000, -((id + 8) * NODE_SPACING), GAME_W + 2000, (id + 10) * NODE_SPACING + GAME_H);
    this.tweens.add({
      targets: cam,
      scrollY: Phaser.Math.Clamp(target, this.minScroll(), this.maxScroll()),
      duration: 480,
      ease: 'Cubic.easeInOut',
    });
  }
}
