// ============================================================
// UI-кит: тематические кнопки, попап-панели, тогглы, форматтеры.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../data/gameData';
import { sfx } from '../services/SoundManager';

export const UI_COLORS = {
  gold: 0xf5b52e,
  goldDeep: 0x8a5a08,
  cream: '#f9ecc8',
  creamDim: '#b9ad87',
  panel: 0x0e2519,
  panelEdge: 0xd9a52f,
  ink: '#241a05',
  jade: 0x2ee6a8,
  red: 0xff6a5a,
  dark: 0x0a1c12,
};

export function roundedRectPath(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - rr);
  g.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  g.lineTo(x + rr, y + h);
  g.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  g.lineTo(x, y + rr);
  g.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  g.closePath();
}

export function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function fmtTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

// ---------- Кнопки ----------

export type ButtonStyle = 'gold' | 'green' | 'dark' | 'red';

const STYLES: Record<ButtonStyle, { top: number; bottom: number; edge: number; shadow: number; text: string }> = {
  gold: { top: 0xffd76a, bottom: 0xee9d12, edge: 0x8a5a08, shadow: 0x7a4c06, text: '#241a05' },
  green: { top: 0x5df0b0, bottom: 0x18a86c, edge: 0x0b6b43, shadow: 0x08532f, text: '#04241a' },
  dark: { top: 0x2c5a40, bottom: 0x173526, edge: 0x0a1f14, shadow: 0x05130b, text: '#f9ecc8' },
  red: { top: 0xff8a76, bottom: 0xd9382e, edge: 0x7e1610, shadow: 0x5e100b, text: '#2a0503' },
};

export interface ButtonOpts {
  w?: number;
  h?: number;
  style?: ButtonStyle;
  font?: number;
  icon?: string;
  disabled?: boolean;
}

/** Объёмная «леденцовая» кнопка с нажатием и звуком. Начало координат — центр. */
export function makeButton(
  scene: Phaser.Scene,
  label: string,
  cb: () => void,
  opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const w = opts.w ?? 220;
  const h = opts.h ?? 64;
  const s = STYLES[opts.style ?? 'gold'];
  const c = scene.add.container(0, 0);

  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    const dy = pressed ? 2 : 0;
    g.fillStyle(s.shadow, 1);
    roundedRectPath(g, -w / 2, -h / 2 + 5, w, h, 14);
    g.fillPath();
    g.fillGradientStyle(s.top, s.top, s.bottom, s.bottom, 1);
    roundedRectPath(g, -w / 2, -h / 2 + dy, w, h, 14);
    g.fillPath();
    g.lineStyle(3, s.edge, 1);
    roundedRectPath(g, -w / 2, -h / 2 + dy, w, h, 14);
    g.strokePath();
    g.fillStyle(0xffffff, 0.18);
    roundedRectPath(g, -w / 2 + 6, -h / 2 + 5 + dy, w - 12, h * 0.32, 10);
    g.fillPath();
  };
  draw(false);

  let iconSpr: Phaser.GameObjects.Image | null = null;
  const iconW = h - 26;
  if (opts.icon) {
    iconSpr = scene.add.image(-w / 2 + 16 + iconW / 2, 0, opts.icon).setScale(iconW / 48);
  }
  const txt = scene
    .add.text(0, 1, label, {
      fontFamily: '"Russo One"',
      fontSize: `${opts.font ?? 21}px`,
      color: s.text,
    })
    .setOrigin(0.5);
  if (iconSpr) {
    txt.setX(((-w / 2 + 16 + iconW + 6) + (w / 2 - 12)) / 2);
  }

  const hit = scene.add
    .rectangle(0, 0, w, h, 0x000000, 0)
    .setInteractive({ useHandCursor: !opts.disabled });
  if (opts.icon && iconSpr) c.add([g, iconSpr, txt, hit]);
  else c.add([g, txt, hit]);

  hit.on('pointerdown', () => {
    if (opts.disabled) return;
    c.setScale(0.96);
  });
  hit.on('pointerup', () => {
    if (opts.disabled) return;
    c.setScale(1);
    sfx.play('click');
    cb();
  });
  hit.on('pointerout', () => c.setScale(1));
  if (opts.disabled) c.setAlpha(0.45);
  return c;
}

/** Круглая иконка-кнопка для хедера. */
export function makeIconButton(
  scene: Phaser.Scene,
  texture: string,
  cb: () => void,
  size = 52,
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x123626, 1);
  g.fillCircle(0, 0, size / 2);
  g.lineStyle(3, UI_COLORS.panelEdge, 0.9);
  g.strokeCircle(0, 0, size / 2 - 1);
  const icon = scene.add.image(0, 0, texture).setScale((size - 22) / 44);
  const hit = scene.add
    .rectangle(0, 0, size, size, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  c.add([g, icon, hit]);
  hit.on('pointerdown', () => c.setScale(0.9));
  hit.on('pointerup', () => {
    c.setScale(1);
    sfx.play('click');
    cb();
  });
  hit.on('pointerout', () => c.setScale(1));
  return c;
}

// ---------- Попап ----------

/** Модальная панель с затемнением, рамкой и уголками-«камнями». */
export class Popup {
  scene: Phaser.Scene;
  container: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private onClose?: () => void;
  closable = true;

  constructor(scene: Phaser.Scene, w: number, h: number, title?: string) {
    this.scene = scene;
    this.dim = scene.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W + 40, GAME_H + 40, 0x030f08, 0)
      .setInteractive();
    this.dim.on('pointerdown', () => {
      if (this.closable) this.close();
    });

    const panel = scene.add.graphics();
    panel.fillStyle(0x03130b, 0.6);
    roundedRectPath(panel, -w / 2 + 7, -h / 2 + 9, w, h, 20);
    panel.fillPath();
    panel.fillStyle(UI_COLORS.panel, 0.98);
    roundedRectPath(panel, -w / 2, -h / 2, w, h, 20);
    panel.fillPath();
    panel.lineStyle(4, UI_COLORS.panelEdge, 1);
    roundedRectPath(panel, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 18);
    panel.strokePath();
    panel.lineStyle(1.5, 0xf5d78a, 0.35);
    roundedRectPath(panel, -w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 13);
    panel.strokePath();
    const corner = (cx: number, cy: number) => {
      panel.fillStyle(0xffd76a, 1);
      panel.beginPath();
      panel.moveTo(cx, cy - 7);
      panel.lineTo(cx + 7, cy);
      panel.lineTo(cx, cy + 7);
      panel.lineTo(cx - 7, cy);
      panel.closePath();
      panel.fillPath();
      panel.fillStyle(0x8a5a08, 1);
      panel.fillCircle(cx, cy, 2);
    };
    corner(-w / 2 + 2, -h / 2 + 2);
    corner(w / 2 - 2, -h / 2 + 2);
    corner(-w / 2 + 2, h / 2 - 2);
    corner(w / 2 - 2, h / 2 - 2);

    this.container = scene.add.container(GAME_W / 2, GAME_H / 2, [this.dim, panel]);
    this.container.setDepth(900);

    if (title) {
      const t = scene
        .add.text(0, -h / 2 + 42, title, {
          fontFamily: '"Russo One"',
          fontSize: '27px',
          color: '#f5b52e',
        })
        .setOrigin(0.5);
      t.setShadow(0, 3, '#000000', 5);
      const line = scene.add.graphics();
      line.lineStyle(2, UI_COLORS.panelEdge, 0.55);
      line.lineBetween(-w / 2 + 34, -h / 2 + 66, -16, -h / 2 + 66);
      line.lineBetween(16, -h / 2 + 66, w / 2 - 34, -h / 2 + 66);
      line.fillStyle(UI_COLORS.gold, 1);
      line.beginPath();
      line.moveTo(0, -h / 2 + 61);
      line.lineTo(6, -h / 2 + 66);
      line.lineTo(0, -h / 2 + 71);
      line.lineTo(-6, -h / 2 + 66);
      line.closePath();
      line.fillPath();
      this.container.add([t, line]);
    }

    const closeBtn = scene
      .add.text(w / 2 - 30, -h / 2 + 26, '✕', {
        fontFamily: '"Rubik"',
        fontSize: '26px',
        color: '#c9b98f',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.close());
    closeBtn.on('pointerover', () => closeBtn.setColor('#f5b52e'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#c9b98f'));
    this.container.add(closeBtn);

    this.container.setScale(0.82);
    this.container.setAlpha(0);
    scene.tweens.add({
      targets: this.container,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
    scene.tweens.add({ targets: this.dim, alpha: { from: 0, to: 0.72 }, duration: 200 });
  }

  add(obj: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): void {
    this.container.add(obj);
  }

  setCloseHandler(fn: () => void): void {
    this.onClose = fn;
  }

  close(): void {
    if (this.container.scene !== this.scene || !this.container.active) return;
    this.scene.tweens.add({
      targets: this.container,
      scale: 0.85,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.container.destroy();
        this.onClose?.();
      },
    });
  }
}

// ---------- Тоггл ----------

export class Toggle {
  container: Phaser.GameObjects.Container;
  private knob: Phaser.GameObjects.Arc;
  private bg: Phaser.GameObjects.Graphics;
  private on: boolean;
  private cb: (v: boolean) => void;

  constructor(scene: Phaser.Scene, initial: boolean, cb: (v: boolean) => void) {
    this.on = initial;
    this.cb = cb;
    this.container = scene.add.container(0, 0);
    this.bg = scene.add.graphics();
    this.knob = scene.add.circle(0, 0, 13, 0xffffff);
    this.container.add([this.bg, this.knob]);
    this.draw();
    const hit = scene.add
      .rectangle(0, 0, 76, 40, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      this.on = !this.on;
      sfx.play('tap');
      this.draw();
      this.cb(this.on);
    });
    this.container.add(hit);
  }

  private draw(): void {
    this.bg.clear();
    const col = this.on ? 0x18a86c : 0x28342c;
    const edge = this.on ? 0x0b6b43 : 0x111a14;
    this.bg.fillStyle(col, 1);
    roundedRectPath(this.bg, -34, -17, 68, 34, 17);
    this.bg.fillPath();
    this.bg.lineStyle(2.5, edge, 1);
    roundedRectPath(this.bg, -34, -17, 68, 34, 17);
    this.bg.strokePath();
    this.container.scene.tweens.add({
      targets: this.knob,
      x: this.on ? 17 : -17,
      duration: 130,
      ease: 'Back.easeOut',
    });
    this.knob.setFillStyle(this.on ? 0xd9ffe9 : 0x93a29a);
  }
}
