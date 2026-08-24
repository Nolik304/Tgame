// ============================================================
// UIScene: HUD-слой поверх карты (отдельная сцена/камера —
// не конфликтует с миром карты).
//  - хедер: профиль ВК, монеты, гемы, жизни (+таймер регена);
//  - блок «Акции и события» с таймерами обратного отсчёта;
//  - кнопка «ИГРАТЬ»; модалки: уровень, сундук, акция, магазин,
//    настройки, профиль, «жизни закончились»; тосты.
// Данные читает из PlayerState (мок → подменяется VK Bridge).
// ============================================================
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  CHAPTERS,
  PROMOS,
  FRUIT_NAMES,
  DAILY_REWARDS,
  getLevels,
  type LevelDef,
  type ChestDef,
  type PromoDef,
} from '../data/gameData';
import { playerState, MAX_LIVES } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';
import { vk } from '../services/VKBridgeService';
import {
  Popup,
  Toggle,
  makeButton,
  makeIconButton,
  roundedRectPath,
  fmtNum,
  fmtTime,
} from '../ui/Modal';

const RUBIK = '"Rubik"';
const RUSSO = '"Russo One"';

export class UIScene extends Phaser.Scene {
  private coinsText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private livesTimerText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private levelChipText!: Phaser.GameObjects.Text;
  private playSubText!: Phaser.GameObjects.Text;
  private boostChip!: Phaser.GameObjects.Container;
  private boostChipText!: Phaser.GameObjects.Text;
  private avatarContainer!: Phaser.GameObjects.Container;

  private promoContainer!: Phaser.GameObjects.Container;
  private promoEnds: Record<string, number> = {};
  private promoIdx = 0;
  private promoCountdown!: Phaser.GameObjects.Text;
  private promoBar!: Phaser.GameObjects.Graphics;
  private promoBusy = false;

  private modal: Popup | null = null;
  private toasts: Phaser.GameObjects.Container[] = [];
  private unsub?: () => void;
  private resetArmed = false;
  private hudVisible = true;
  private pendingCoinFly = 0;
  private dailyShown = false;
  private giftDot?: Phaser.GameObjects.Arc;

  constructor() {
    super('UIScene');
  }

  create(): void {
    PROMOS.forEach((p) => {
      this.promoEnds[p.id] = Date.now() + p.durationMin * 60_000;
    });

    this.buildHeader();
    this.buildPromoBanner();
    this.buildPlayButton();

    this.events.on('openLevel', this.openLevelModal, this);
    this.events.on('openChest', this.openChestModal, this);
    this.events.on('toast', this.toast, this);
    this.events.on('hud', this.setHudVisible, this);
    this.events.on('coinFly', this.flyCoins, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('openLevel', this.openLevelModal, this);
      this.events.off('openChest', this.openChestModal, this);
      this.events.off('toast', this.toast, this);
      this.events.off('hud', this.setHudVisible, this);
      this.events.off('coinFly', this.flyCoins, this);
      this.unsub?.();
    });

    this.unsub = playerState.onChange(() => this.refreshHUD());

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
    this.time.addEvent({ delay: 6000, loop: true, callback: () => this.cyclePromo() });

    this.refreshHUD();
    this.refreshProfile();
    this.drawPromo(this.promoIdx);

    // помечаем все HUD-объекты, чтобы прятать их на время боя
    this.children.list.forEach((o) => {
      (o as { __hud?: boolean }).__hud = true;
    });

    if (playerState.canClaimDaily() && !this.dailyShown) {
      this.dailyShown = true;
      this.time.delayedCall(1200, () => {
        if (!this.modal && !this.scene.isActive('GameScene')) this.openDailyModal();
      });
    }
  }

  /** Показать/спрятать HUD (на время боя HUD не мешает GameScene). */
  private setHudVisible(v: boolean): void {
    this.hudVisible = v;
    this.children.list.forEach((o) => {
      if ((o as { __hud?: boolean }).__hud) {
        (o as Phaser.GameObjects.GameObject & { setVisible: (b: boolean) => void }).setVisible(v);
      }
    });
    if (v && this.pendingCoinFly > 0) {
      const n = this.pendingCoinFly;
      this.pendingCoinFly = 0;
      this.time.delayedCall(350, () => this.flyCoins(n));
    }
  }

  /** Монеты летят с поля боя в пилюлю монет. */
  private flyCoins(count: number): void {
    if (!this.hudVisible) {
      this.pendingCoinFly += count;
      return;
    }
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 80, () => {
        if (!this.hudVisible || !this.scene.isActive('UIScene')) return;
        const coin = this.add
          .image(GAME_W / 2 + Phaser.Math.Between(-170, 170), 470 + Phaser.Math.Between(-40, 120), 'coin')
          .setScale(0.7)
          .setDepth(95);
        this.tweens.add({
          targets: coin,
          x: 334,
          y: 40,
          scale: 0.35,
          duration: 640,
          ease: 'Cubic.easeIn',
          delay: 140,
          onComplete: () => {
            coin.destroy();
            this.pop(this.coinsText);
            sfx.play('coin');
          },
        });
      });
    }
  }

  /** «Дар богов» — ежедневная лестница наград на 7 дней. */
  private openDailyModal(): void {
    const pop = new Popup(this, 470, 480, 'ДАР БОГОВ');
    const items: Phaser.GameObjects.GameObject[] = [];
    const claimable = playerState.canClaimDaily();
    const dayNext = playerState.dailyDayNext();
    const streak = playerState.data.dailyStreak;

    items.push(
      this.add.text(0, -174, claimable ? 'Ежедневная лестница наград' : 'Сегодня дар уже получен', {
        fontFamily: RUBIK,
        fontSize: '14px',
        color: '#b9ad87',
      }).setOrigin(0.5),
    );

    const tileW = 56;
    const gap = 5;
    const totalW = 7 * tileW + 6 * gap;
    DAILY_REWARDS.forEach((rew, i) => {
      const day = i + 1;
      const x = -totalW / 2 + tileW / 2 + i * (tileW + gap);
      const isNext = claimable && day === dayNext;
      const isDone = claimable ? day < dayNext : day <= streak;
      const g = this.add.graphics();
      g.fillStyle(isNext ? 0x3a2c08 : 0x0c2417, 1);
      roundedRectPath(g, x - tileW / 2, -148, tileW, 108, 8);
      g.fillPath();
      g.lineStyle(2, isNext ? 0xf5b52e : isDone ? 0x2c5a40 : 0x1d4a2e, 1);
      roundedRectPath(g, x - tileW / 2, -148, tileW, 108, 8);
      g.strokePath();
      items.push(g);
      items.push(
        this.add.text(x, -134, `День ${day}`, {
          fontFamily: RUBIK,
          fontSize: '10px',
          color: isNext ? '#ffd76a' : '#8fd8b4',
        }).setOrigin(0.5),
      );
      items.push(this.add.image(x, -104, 'coin').setScale(0.55));
      items.push(
        this.add.text(x, -76, `${rew.coins}`, { fontFamily: RUSSO, fontSize: '12px', color: '#f9ecc8' }).setOrigin(0.5),
      );
      if (rew.gems > 0) {
        items.push(this.add.image(x - 12, -54, 'gemIcon').setScale(0.42));
        items.push(
          this.add.text(x, -53, `+${rew.gems}`, { fontFamily: RUSSO, fontSize: '11px', color: '#9dffce' }).setOrigin(0, 0.5),
        );
      }
      if (isDone) {
        g.lineStyle(3, 0x2ee6a8, 1);
        g.lineBetween(x - 8, -98, x - 2, -91);
        g.lineBetween(x - 2, -91, x + 9, -106);
      }
      if (isNext) {
        const gl = this.add.image(x, -94, 'glow').setTint(0xf5b52e).setScale(0.8).setAlpha(0.5);
        items.push(gl);
        this.tweens.add({ targets: gl, alpha: { from: 0.25, to: 0.6 }, duration: 600, yoyo: true, repeat: -1 });
      }
    });

    items.push(
      this.add.text(0, 4, claimable ? `День ${dayNext} из 7 — забери дар!` : 'Возвращайся завтра — лестница продолжится', {
        fontFamily: RUBIK,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#f9ecc8',
      }).setOrigin(0.5),
    );

    const btn = makeButton(
      this,
      claimable ? `ЗАБРАТЬ ДЕНЬ ${dayNext}` : 'ПРИХОДИ ЗАВТРА',
      () => {
        const r = playerState.claimDaily();
        if (r) {
          sfx.play('chest');
          sfx.vibrate('medium');
          this.toast(`Дар богов: +${r.coins} монет${r.gems ? `, +${r.gems} гемов` : ''}`);
          this.giftDot?.destroy();
          this.giftDot = undefined;
          const em = this.add
            .particles(GAME_W / 2, GAME_H / 2 - 84, 'spark', {
              speed: { min: 120, max: 420 },
              scale: { start: 0.8, end: 0 },
              lifespan: 900,
              tint: [0xffd76a, 0x9dffce, 0xff97a8],
              gravityY: 300,
              emitting: false,
            })
            .setDepth(120);
          em.explode(40);
          this.time.delayedCall(1000, () => em.destroy());
          pop.close();
        } else {
          this.toast('Боги одарят тебя завтра');
        }
      },
      { w: 340, h: 66, style: claimable ? 'gold' : 'dark', font: 19 },
    ).setPosition(0, 74);
    items.push(btn);

    pop.add(items);
  }

  // ---------------- Хедер ----------------

  private buildHeader(): void {
    this.avatarContainer = this.add.container(46, 46);
    const ring = this.add.graphics();
    ring.fillStyle(0x123626, 1);
    ring.fillCircle(0, 0, 27);
    ring.lineStyle(3.5, 0xf5b52e, 1);
    ring.strokeCircle(0, 0, 26);
    this.avatarContainer.add(ring);
    this.avatarContainer.setInteractive(
      new Phaser.Geom.Circle(0, 0, 30),
      Phaser.Geom.Circle.Contains,
    );
    this.avatarContainer.on('pointerup', () => this.openProfileModal());

    this.nameText = this.add.text(84, 32, '…', {
      fontFamily: RUBIK,
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#f9ecc8',
    });
    this.levelChipText = this.add.text(84, 54, '', {
      fontFamily: RUBIK,
      fontSize: '12px',
      color: '#8fd8b4',
    });

    // монеты
    this.coinsText = this.makePill(334, 40, 128, 'coin');
    // гемы
    this.gemsText = this.makePill(464, 40, 112, 'gemIcon');
    // жизни
    this.livesText = this.makePill(100, 92, 116, 'heart');
    this.livesTimerText = this.add.text(176, 92, '', {
      fontFamily: RUBIK,
      fontSize: '12px',
      color: '#f5b52e',
    }).setOrigin(0, 0.5);

    // буст-чип
    this.boostChip = this.add.container(300, 92).setAlpha(0);
    const chipG = this.add.graphics();
    chipG.fillStyle(0x4c3a10, 0.95);
    roundedRectPath(chipG, -86, -16, 172, 32, 16);
    chipG.fillPath();
    chipG.lineStyle(2, 0xf5b52e, 1);
    roundedRectPath(chipG, -86, -16, 172, 32, 16);
    chipG.strokePath();
    this.boostChipText = this.add.text(0, 1, '', {
      fontFamily: RUSSO,
      fontSize: '13px',
      color: '#ffd76a',
    }).setOrigin(0.5);
    this.boostChip.add([chipG, this.boostChipText]);
    this.boostChip.setInteractive(new Phaser.Geom.Rectangle(-86, -16, 172, 32), Phaser.Geom.Rectangle.Contains);
    this.boostChip.on('pointerup', () => this.toast('x2 монеты за уровни активен!'));

    // кнопки справа
    makeIconButton(this, 'gift', () => {
      sfx.play('click');
      this.openDailyModal();
    }).setPosition(396, 92);
    if (playerState.canClaimDaily()) {
      this.giftDot = this.add.circle(412, 76, 7, 0xff5a5a).setStrokeStyle(2.5, 0x08190f);
      this.tweens.add({
        targets: this.giftDot,
        scale: { from: 1, to: 1.35 },
        duration: 480,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    makeIconButton(this, 'gear', () => this.openSettingsModal()).setPosition(448, 92);
    makeIconButton(this, 'bag', () => this.openShopModal()).setPosition(500, 92);
  }

  /** Масштаб, приводящий PNG любого размера к нужной высоте (для иконок). */
  private fitIcon(key: string, targetPx: number): number {
    const tex = this.textures.get(key);
    if (!tex || tex.key === '__MISSING') return targetPx / 96;
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const w = src?.width || 96;
    return targetPx / w;
  }

  /** Пилюля ресурса: иконка + значение. Возвращает текстовый объект значения. */
  private makePill(x: number, y: number, w: number, icon: string): Phaser.GameObjects.Text {
    const g = this.add.graphics();
    g.fillStyle(0x08190f, 0.88);
    roundedRectPath(g, x - w / 2, y - 22, w, 44, 22);
    g.fillPath();
    g.lineStyle(2.5, 0xd9a52f, 0.9);
    roundedRectPath(g, x - w / 2, y - 22, w, 44, 22);
    g.strokePath();
    this.add.image(x - w / 2 + 24, y, icon).setScale(0.72);
    const txt = this.add.text(x + 8, y + 1, '0', {
      fontFamily: RUSSO,
      fontSize: '17px',
      color: '#f9ecc8',
    }).setOrigin(0.5);
    return txt;
  }

  private pop(obj: Phaser.GameObjects.Text): void {
    this.tweens.add({ targets: obj, scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.easeOut' });
  }

  private refreshHUD(): void {
    const d = playerState.data;
    const setIf = (t: Phaser.GameObjects.Text, v: string) => {
      if (t.text !== v) {
        t.setText(v);
        this.pop(t);
      }
    };
    setIf(this.coinsText, fmtNum(d.coins));
    setIf(this.gemsText, fmtNum(d.gems));
    const lives = playerState.livesNow();
    setIf(this.livesText, `${lives}/${MAX_LIVES}`);
    const cur = Math.min(d.level, 24);
    this.levelChipText.setText(`Уровень ${cur} · ${this.chapterOf(cur)}`);
    this.playSubText?.setText(`Уровень ${cur} — ${this.levelName(cur)}`);
    this.refreshProfile();
    this.updateBoostChip();
  }

  private chapterOf(id: number): string {
    return CHAPTERS.find((c) => id >= c.from && id <= c.to)?.title ?? '';
  }

  private levelName(id: number): string {
    return getLevels().find((l) => l.id === id)?.name ?? '';
  }

  private refreshProfile(): void {
    const d = playerState.data;
    const name = d.name || 'Искатель Богов';
    this.nameText.setText(name.length > 22 ? name.slice(0, 21) + '…' : name);
    // инициалы в аватаре
    const old = this.avatarContainer.getByName('ident');
    if (old) old.destroy();
    const initials = name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    const t = this.add
      .text(0, 1, initials, { fontFamily: RUSSO, fontSize: '19px', color: '#9dffce' })
      .setOrigin(0.5)
      .setName('ident');
    this.avatarContainer.add(t);
  }

  private updateBoostChip(): void {
    const active = playerState.boostActive('coins2x');
    this.boostChip.setAlpha(active ? 1 : 0);
  }

  // ---------------- Акции ----------------

  private buildPromoBanner(): void {
    this.promoContainer = this.add.container(GAME_W / 2, 196);
    this.promoContainer.setInteractive(
      new Phaser.Geom.Rectangle(-248, -50, 496, 100),
      Phaser.Geom.Rectangle.Contains,
    );
    this.promoContainer.on('pointerup', () => this.openPromoModal(PROMOS[this.promoIdx]));
    this.promoBar = this.add.graphics();
    this.promoCountdown = this.add.text(150, -8, '', {
      fontFamily: RUSSO,
      fontSize: '23px',
      color: '#ffd76a',
    }).setOrigin(0.5);
    this.promoContainer.add([this.promoBar, this.promoCountdown]);
  }

  private drawPromo(idx: number): void {
    const p = PROMOS[idx];
    const old = this.promoContainer.getByName('body');
    if (old) old.destroy();
    const body = this.add.container(0, 0).setName('body');

    const g = this.add.graphics();
    g.fillStyle(0x07180e, 0.94);
    roundedRectPath(g, -248, -50, 496, 100, 16);
    g.fillPath();
    g.lineStyle(3, p.accent, 1);
    roundedRectPath(g, -248, -50, 496, 100, 16);
    g.strokePath();
    // косые полосы
    g.fillStyle(p.accent, 0.07);
    for (let i = 0; i < 6; i++) {
      const x = -240 + i * 90;
      g.beginPath();
      g.moveTo(x, -47);
      g.lineTo(x + 34, -47);
      g.lineTo(x - 16, 47);
      g.lineTo(x - 50, 47);
      g.closePath();
      g.fillPath();
    }
    // тег
    g.fillStyle(p.accent, 1);
    roundedRectPath(g, -234, -38, 96, 22, 11);
    g.fillPath();
    const tag = this.add.text(-186, -27, p.tag, {
      fontFamily: RUBIK,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#08190f',
    }).setOrigin(0.5);
    const title = this.add.text(-234, 2, p.title, {
      fontFamily: RUSSO,
      fontSize: '19px',
      color: '#f9ecc8',
    }).setOrigin(0, 0.5);
    const desc = this.add.text(-234, 28, p.desc, {
      fontFamily: RUBIK,
      fontSize: '12.5px',
      color: '#b9ad87',
      wordWrap: { width: 280 },
    }).setOrigin(0, 0.5);
    const glow = this.add.image(-252, 0, 'glow').setTint(p.accent).setAlpha(0.5).setScale(0.7);

    body.add([g, glow, tag, title, desc]);
    this.promoContainer.addAt(body, 0);
    this.updatePromoTimer();
  }

  private updatePromoTimer(): void {
    const p = PROMOS[this.promoIdx];
    const left = this.promoEnds[p.id] - Date.now();
    this.promoCountdown.setText(left > 0 ? fmtTime(left) : '00:00');
    this.promoBar.clear();
    const frac = Phaser.Math.Clamp(left / (p.durationMin * 60_000), 0, 1);
    this.promoBar.fillStyle(0x12281a, 1);
    roundedRectPath(this.promoBar, 80, 14, 140, 9, 4);
    this.promoBar.fillPath();
    if (frac > 0) {
      this.promoBar.fillStyle(p.accent, 1);
      roundedRectPath(this.promoBar, 80, 14, Math.max(9, 140 * frac), 9, 4);
      this.promoBar.fillPath();
    }
    this.promoCountdown.setAlpha(left > 0 ? 1 : 0.45);
  }

  private cyclePromo(): void {
    this.promoIdx = (this.promoIdx + 1) % PROMOS.length;
    this.promoContainer.setAlpha(0);
    this.promoContainer.x = GAME_W / 2 + 60;
    this.drawPromo(this.promoIdx);
    this.tweens.add({
      targets: this.promoContainer,
      alpha: 1,
      x: GAME_W / 2,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
  }

  // ---------------- Кнопка ИГРАТЬ ----------------

  private buildPlayButton(): void {
    const c = this.add.container(GAME_W / 2, 880);
    const w = 320;
    const h = 96;
    const g = this.add.graphics();
    const draw = (pressed: boolean) => {
      g.clear();
      const dy = pressed ? 3 : 0;
      g.fillStyle(0x7a4c06, 1);
      roundedRectPath(g, -w / 2, -h / 2 + 7, w, h, 24);
      g.fillPath();
      g.fillGradientStyle(0xffd76a, 0xffd76a, 0xee9d12, 0xee9d12, 1);
      roundedRectPath(g, -w / 2, -h / 2 + dy, w, h, 24);
      g.fillPath();
      g.lineStyle(3.5, 0x8a5a08, 1);
      roundedRectPath(g, -w / 2, -h / 2 + dy, w, h, 24);
      g.strokePath();
      g.fillStyle(0xffffff, 0.2);
      roundedRectPath(g, -w / 2 + 10, -h / 2 + 6 + dy, w - 20, h * 0.34, 16);
      g.fillPath();
    };
    draw(false);
    const label = this.add.text(0, -10, 'ИГРАТЬ', {
      fontFamily: RUSSO,
      fontSize: '33px',
      color: '#241a05',
    }).setOrigin(0.5);
    this.playSubText = this.add.text(0, 24, '', {
      fontFamily: RUBIK,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#4c3404',
    }).setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => draw(true));
    hit.on('pointerout', () => draw(false));
    hit.on('pointerup', () => {
      draw(false);
      sfx.play('click');
      sfx.vibrate('light');
      this.scene.get('MapScene')?.events.emit('focusLevel', Math.min(playerState.data.level, 24));
    });
    c.add([g, label, this.playSubText, hit]);
    this.tweens.add({
      targets: c,
      scale: { from: 1, to: 1.045 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add.text(GAME_W / 2, 800, 'Тяни карту · Выбирай уровень · Собирай сокровища', {
      fontFamily: RUBIK,
      fontSize: '13px',
      color: '#71806f',
    }).setOrigin(0.5);
  }

  // ---------------- Тик (раз в секунду) ----------------

  private tick(): void {
    const remain = playerState.nextLifeInMs();
    this.livesTimerText.setText(playerState.livesNow() < MAX_LIVES ? `след. ${fmtTime(remain)}` : '');
    this.updatePromoTimer();
    this.updateBoostChip();
    if (playerState.boostActive('coins2x')) {
      const left = (playerState.data.boosts.coins2x ?? 0) - Date.now();
      this.boostChipText.setText(`X2 МОНЕТЫ · ${fmtTime(left)}`);
    }
  }

  // ---------------- Модалки ----------------

  private closeModal(): void {
    this.modal?.close();
    this.modal = null;
  }

  private openLevelModal(def: LevelDef): void {
    this.closeModal();
    const pop = new Popup(this, 460, 520);
    this.modal = pop;

    const headY = -180;
    const items: Phaser.GameObjects.GameObject[] = [];

    const numText = this.add
      .text(0, headY, `УРОВЕНЬ ${def.id}`, { fontFamily: RUSSO, fontSize: '27px', color: '#f5b52e' })
      .setOrigin(0.5);
    const nameText = this.add
      .text(0, headY + 32, def.name, { fontFamily: RUBIK, fontSize: '15px', color: '#b9ad87' })
      .setOrigin(0.5);
    items.push(numText, nameText);

    if (def.type === 'boss' && def.bossName) {
      items.push(this.add.image(-118, headY + 78, 'skull').setScale(0.8));
      items.push(
        this.add.text(8, headY + 78, `БОСС: ${def.bossName}`, {
          fontFamily: RUSSO,
          fontSize: '15px',
          color: '#ff8a76',
        }).setOrigin(0.5),
      );
    }

    // цель
    const goalY = headY + 128;
    const gBox = this.add.graphics();
    gBox.fillStyle(0x0a1c12, 1);
    roundedRectPath(gBox, -190, goalY - 30, 380, 60, 12);
    gBox.fillPath();
    gBox.lineStyle(2, 0x2c5a40, 1);
    roundedRectPath(gBox, -190, goalY - 30, 380, 60, 12);
    gBox.strokePath();
    items.push(gBox);
    if (def.goal.type === 'collect') {
      const icon = this.add
        .image(-156, goalY, `fruit_${def.goal.kind}`)
        .setScale(this.fitIcon(`fruit_${def.goal.kind}`, 40));
      items.push(icon);
      items.push(
        this.add.text(10, goalY + 1, `Собери ${def.goal.amount} × ${FRUIT_NAMES[def.goal.kind]}`, {
          fontFamily: RUBIK,
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#f9ecc8',
        }).setOrigin(0.5),
      );
    } else {
      items.push(this.add.image(-156, goalY, 'trophy').setScale(0.85));
      items.push(
        this.add.text(10, goalY + 1, `Набери ${fmtNum(def.goal.amount)} очков`, {
          fontFamily: RUBIK,
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#f9ecc8',
        }).setOrigin(0.5),
      );
    }

    items.push(
      this.add.text(-92, goalY + 62, `Ходы: ${def.moves}`, {
        fontFamily: RUSSO,
        fontSize: '16px',
        color: '#9dffce',
      }).setOrigin(0.5),
    );

    // награда
    const rewY = goalY + 112;
    const coins = def.rewardCoins * (playerState.boostActive('coins2x') ? 2 : 1);
    items.push(this.add.image(-70, rewY, 'coin').setScale(0.7));
    items.push(
      this.add.text(-14, rewY + 1, `+${coins}`, { fontFamily: RUSSO, fontSize: '17px', color: '#f9ecc8' }).setOrigin(0, 0.5),
    );
    if (playerState.boostActive('coins2x')) {
      items.push(
        this.add.text(58, rewY + 1, 'x2', { fontFamily: RUSSO, fontSize: '14px', color: '#ffd76a' }).setOrigin(0, 0.5),
      );
    }
    if (def.rewardGems > 0) {
      items.push(this.add.image(110, rewY, 'gemIcon').setScale(0.62));
      items.push(
        this.add.text(160, rewY + 1, `+${def.rewardGems}`, { fontFamily: RUSSO, fontSize: '17px', color: '#f9ecc8' }).setOrigin(0, 0.5),
      );
    }

    // лучшие звёзды
    const best = playerState.starsOf(def.id);
    for (let i = 0; i < 3; i++) {
      items.push(
        this.add.image((i - 1) * 40, rewY + 54, 'star')
          .setScale(0.62)
          .setTint(i < best ? 0xffd76a : 0x33413a),
      );
    }

    const playBtn = makeButton(
      this,
      'ИГРАТЬ',
      () => {
        this.closeModal();
        this.tryStartLevel(def);
      },
      { w: 300, h: 74, style: 'green', font: 26 },
    ).setPosition(0, 186);
    items.push(playBtn);

    pop.add(items);
  }

  private tryStartLevel(def: LevelDef): void {
    if (playerState.livesNow() > 0) {
      this.scene.stop('MapScene');
      this.scene.stop('UIScene');
      this.scene.start('GameScene', { levelId: def.id });
      return;
    }
    this.openLivesModal(() => this.tryStartLevel(def));
  }

  private openLivesModal(onOk: () => void): void {
    this.closeModal();
    const pop = new Popup(this, 420, 400, 'ЖИЗНИ ЗАКОНЧИЛИСЬ');
    this.modal = pop;
    const heart = this.add.image(0, -110, 'heart').setScale(1.4).setTint(0x5a6a60);
    const waitText = this.add.text(0, -30, `До новой жизни: ${fmtTime(playerState.nextLifeInMs())}`, {
      fontFamily: RUBIK,
      fontSize: '16px',
      color: '#f9ecc8',
    }).setOrigin(0.5);
    const timer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => waitText.setText(`До новой жизни: ${fmtTime(playerState.nextLifeInMs())}`),
    });
    pop.setCloseHandler(() => timer.destroy());

    const adBtn = makeButton(
      this,
      'РЕКЛАМА · +1 ЖИЗНЬ',
      async () => {
        const fade = (v: number) =>
          adBtn.list.forEach((o) => {
            const a = o as unknown as { setAlpha?: (a: number) => void };
            a.setAlpha?.(v);
          });
        fade(0.55);
        const ok = await vk.showRewardedAd();
        if (ok && this.scene.isActive('UIScene')) {
          playerState.addLife();
          sfx.play('heart');
          this.toast('+1 жизнь!');
          this.closeModal();
          onOk();
        } else if (this.scene.isActive('UIScene')) {
          fade(1);
          this.toast('Реклама недоступна');
        }
      },
      { w: 320, h: 66, style: 'gold', font: 19 },
    ).setPosition(0, 46);
    const waitBtn = makeButton(this, 'ПОДОЖДАТЬ', () => this.closeModal(), {
      w: 320,
      h: 58,
      style: 'dark',
      font: 17,
    }).setPosition(0, 128);
    pop.add([heart, waitText, adBtn, waitBtn]);
  }

  private openChestModal(chest: ChestDef): void {
    this.closeModal();
    const pop = new Popup(this, 420, 440, chest.label.toUpperCase());
    this.modal = pop;
    pop.closable = false;

    const spr = this.add.image(0, -84, 'chest').setScale(1.7);
    this.tweens.add({
      targets: spr,
      angle: { from: -4, to: 4 },
      duration: 160,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const hint = this.add.text(0, -8, 'Внутри сверкают сокровища…', {
      fontFamily: RUBIK,
      fontSize: '15px',
      color: '#b9ad87',
    }).setOrigin(0.5);
    const openBtn = makeButton(
      this,
      'ОТКРЫТЬ',
      () => {
        openBtn.destroy();
        hint.destroy();
        sfx.play('chest');
        sfx.vibrate('heavy');
        // конфетти
        const em = this.add.particles(GAME_W / 2, GAME_H / 2 - 84, 'spark', {
          speed: { min: 120, max: 380 },
          angle: { min: 200, max: 340 },
          scale: { start: 0.8, end: 0 },
          lifespan: 700,
          tint: [0xffd76a, 0x9dffce, 0xff97a8, 0xa3c6ff],
          gravityY: 300,
          emitting: false,
        });
        em.explode(42);
        this.time.delayedCall(900, () => em.destroy());
        this.tweens.add({ targets: spr, scale: 2, angle: 0, duration: 250, ease: 'Back.easeOut' });

        const r1 = this.add.image(-56, 34, 'coin').setScale(0.8);
        const t1 = this.add.text(-16, 35, `+${chest.coins}`, {
          fontFamily: RUSSO,
          fontSize: '22px',
          color: '#f9ecc8',
        }).setOrigin(0, 0.5);
        const r2 = this.add.image(74, 34, 'gemIcon').setScale(0.72);
        const t2 = this.add.text(110, 35, `+${chest.gems}`, {
          fontFamily: RUSSO,
          fontSize: '22px',
          color: '#f9ecc8',
        }).setOrigin(0, 0.5);
        const takeBtn = makeButton(
          this,
          'ЗАБРАТЬ',
          () => {
            playerState.claimChest(chest.id, chest.coins, chest.gems);
            sfx.play('coin');
            this.toast(`Сундук открыт: +${chest.coins} монет, +${chest.gems} гемов`);
            this.scene.get('MapScene')?.events.emit('refreshChests');
            this.closeModal();
          },
          { w: 300, h: 68, style: 'green', font: 23 },
        ).setPosition(0, 128);
        pop.add([r1, t1, r2, t2, takeBtn]);
      },
      { w: 300, h: 68, style: 'gold', font: 23 },
    ).setPosition(0, 128);
    pop.add([spr, hint, openBtn]);
  }

  private openPromoModal(p: PromoDef): void {
    this.closeModal();
    const pop = new Popup(this, 440, 430, p.title.toUpperCase());
    this.modal = pop;

    const glow = this.add.image(0, -104, 'glow').setTint(p.accent).setScale(1.2).setAlpha(0.7);
    const tagIcon = p.kind === 'coins' ? 'coin' : p.kind === 'event' ? 'gemIcon' : 'star';
    const icon = this.add.image(0, -104, tagIcon).setScale(1.1);
    const desc = this.add.text(0, -30, p.desc, {
      fontFamily: RUBIK,
      fontSize: '16px',
      color: '#f9ecc8',
      align: 'center',
      wordWrap: { width: 360 },
    }).setOrigin(0.5);
    const left = this.promoEnds[p.id] - Date.now();
    const countdown = this.add.text(0, 24, left > 0 ? fmtTime(left) : 'Акция завершена', {
      fontFamily: RUSSO,
      fontSize: '30px',
      color: left > 0 ? '#ffd76a' : '#71806f',
    }).setOrigin(0.5);
    if (left > 0) {
      const t = this.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => {
          const l = this.promoEnds[p.id] - Date.now();
          countdown.setText(l > 0 ? fmtTime(l) : 'Акция завершена');
          if (l <= 0) t.destroy();
        },
      });
      pop.setCloseHandler(() => t.destroy());
    }

    let cta: Phaser.GameObjects.Container;
    if (p.kind === 'coins') {
      const active = playerState.boostActive('coins2x');
      cta = makeButton(
        this,
        active ? 'УЖЕ АКТИВЕН' : 'АКТИВИРОВАТЬ X2',
        () => {
          if (playerState.boostActive('coins2x')) return;
          playerState.activateBoost('coins2x', 120);
          sfx.play('boost');
          sfx.vibrate('medium');
          this.toast('x2 монеты активен на 2 часа!');
          this.closeModal();
        },
        { w: 320, h: 70, style: 'gold', font: 21, disabled: active },
      ).setPosition(0, 122);
    } else if (p.kind === 'event') {
      cta = makeButton(
        this,
        'СМОТРЕТЬ РЕКЛАМУ · +3 ГЕМА',
        async () => {
          if (this.promoBusy) return;
          this.promoBusy = true;
          const ok = await vk.showRewardedAd();
          this.promoBusy = false;
          if (ok && this.scene.isActive('UIScene')) {
            playerState.addGems(3);
            sfx.play('coin');
            this.toast('+3 гема!');
            this.closeModal();
          } else if (this.scene.isActive('UIScene')) {
            this.toast('Реклама недоступна');
          }
        },
        { w: 340, h: 70, style: 'green', font: 18 },
      ).setPosition(0, 122);
    } else {
      cta = makeButton(
        this,
        'В МАГАЗИН',
        () => {
          this.closeModal();
          this.time.delayedCall(180, () => this.openShopModal());
        },
        { w: 320, h: 70, style: 'gold', font: 21 },
      ).setPosition(0, 122);
    }
    pop.add([glow, icon, desc, countdown, cta]);
  }

  // ---------------- Магазин ----------------

  private openShopModal(): void {
    this.closeModal();
    const pop = new Popup(this, 480, 660, 'МАГАЗИН');
    this.modal = pop;

    const items: Phaser.GameObjects.GameObject[] = [];
    const section = (y: number, label: string) => {
      items.push(
        this.add.text(-200, y, label, {
          fontFamily: RUSSO,
          fontSize: '14px',
          color: '#8fd8b4',
        }),
      );
      const line = this.add.graphics();
      line.lineStyle(1.5, 0x2c5a40, 1);
      line.lineBetween(-200, y + 22, 200, y + 22);
      items.push(line);
    };

    const coinPacks = [
      { coins: 500, price: 8 },
      { coins: 1200, price: 16 },
      { coins: 3000, price: 32 },
    ];
    section(-244, 'МОНЕТЫ ЗА ГЕМЫ');
    coinPacks.forEach((pack, i) => {
      const btn = makeButton(
        this,
        `${fmtNum(pack.coins)} монет — ${pack.price} гемов`,
        () => {
          if (playerState.data.gems < pack.price) {
            sfx.play('invalid');
            this.toast('Не хватает гемов');
            return;
          }
          playerState.addGems(-pack.price);
          playerState.addCoins(pack.coins);
          sfx.play('coin');
          this.toast(`+${fmtNum(pack.coins)} монет!`);
        },
        { w: 400, h: 52, style: 'dark', font: 16, icon: 'coin' },
      ).setPosition(0, -204 + i * 60);
      items.push(btn);
    });

    const gemPacks = [
      { gems: 30, rub: 199, item: 'gems_30' },
      { gems: 80, rub: 399, item: 'gems_80' },
      { gems: 200, rub: 799, item: 'gems_200' },
    ];
    section(-8, 'ГЕМЫ · VK PAY');
    gemPacks.forEach((pack, i) => {
      const btn = makeButton(
        this,
        `${pack.gems} гемов — ${pack.rub} ₽`,
        async () => {
          this.toast('Обрабатываем заказ…');
          const ok = await vk.purchase(pack.item);
          if (ok && this.scene.isActive('UIScene')) {
            playerState.addGems(pack.gems);
            sfx.play('coin');
            this.toast(`Спасибо за покупку! +${pack.gems} гемов`);
          } else if (this.scene.isActive('UIScene')) {
            this.toast('Заказ отменён');
          }
        },
        { w: 400, h: 52, style: 'dark', font: 16, icon: 'gemIcon' },
      ).setPosition(0, 32 + i * 60);
      items.push(btn);
    });

    section(168, 'БЕСПЛАТНО');
    const adCoin = makeButton(
      this,
      'Реклама — +50 монет',
      async () => {
        const ok = await vk.showRewardedAd();
        if (ok && this.scene.isActive('UIScene')) {
          playerState.addCoins(50);
          sfx.play('coin');
          this.toast('+50 монет за просмотр!');
        }
      },
      { w: 400, h: 52, style: 'green', font: 16, icon: 'coin' },
    ).setPosition(0, 208);
    const adLife = makeButton(
      this,
      'Реклама — +1 жизнь',
      async () => {
        const ok = await vk.showRewardedAd();
        if (ok && this.scene.isActive('UIScene')) {
          playerState.addLife();
          sfx.play('heart');
          this.toast('+1 жизнь!');
        }
      },
      { w: 400, h: 52, style: 'green', font: 16, icon: 'heart' },
    ).setPosition(0, 268);
    items.push(adCoin, adLife);

    pop.add(items);
  }

  // ---------------- Настройки / профиль ----------------

  private openSettingsModal(): void {
    this.closeModal();
    const pop = new Popup(this, 420, 470, 'НАСТРОЙКИ');
    this.modal = pop;

    const items: Phaser.GameObjects.GameObject[] = [];
    const row = (y: number, label: string, value: boolean, cb: (v: boolean) => void) => {
      items.push(
        this.add.text(-160, y, label, {
          fontFamily: RUBIK,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#f9ecc8',
        }).setOrigin(0, 0.5),
      );
      const tg = new Toggle(this, value, cb);
      tg.container.setPosition(130, y);
      items.push(tg.container);
    };
    row(-140, 'Звук', playerState.data.settings.sound, (v) => {
      playerState.setSetting('sound', v);
      if (v) sfx.play('coin');
    });
    row(-76, 'Вибрация', playerState.data.settings.vibration, (v) => {
      playerState.setSetting('vibration', v);
      if (v) sfx.vibrate('medium');
    });

    const line = this.add.graphics();
    line.lineStyle(1.5, 0x2c5a40, 1);
    line.lineBetween(-170, -26, 170, -26);
    items.push(line);

    const resetBtn = makeButton(
      this,
      'СБРОСИТЬ ПРОГРЕСС',
      () => {
        if (!this.resetArmed) {
          this.resetArmed = true;
          (resetBtn.list[1] as Phaser.GameObjects.Text).setText('ТОЧНО? НАЖМИ ЕЩЁ РАЗ');
          this.time.delayedCall(2500, () => {
            this.resetArmed = false;
            if (resetBtn.active) {
              (resetBtn.list[1] as Phaser.GameObjects.Text).setText('СБРОСИТЬ ПРОГРЕСС');
            }
          });
          return;
        }
        this.resetArmed = false;
        playerState.reset();
        sfx.play('lose');
        this.toast('Прогресс сброшен');
        this.closeModal();
      },
      { w: 340, h: 58, style: 'red', font: 16 },
    ).setPosition(0, 30);
    items.push(resetBtn);

    items.push(
      this.add.text(0, 118, 'Сейв: localStorage + облако ВК', {
        fontFamily: RUBIK,
        fontSize: '13px',
        color: '#71806f',
      }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, 146, 'v0.1 · Phaser 3 · VK Mini Apps', {
        fontFamily: RUBIK,
        fontSize: '13px',
        color: '#71806f',
      }).setOrigin(0.5),
    );
    pop.add(items);
  }

  private openProfileModal(): void {
    this.closeModal();
    const pop = new Popup(this, 420, 470, 'ПРОФИЛЬ');
    this.modal = pop;
    const d = playerState.data;

    const items: Phaser.GameObjects.GameObject[] = [];
    const av = this.add.graphics();
    av.fillStyle(0x123626, 1);
    av.fillCircle(0, -128, 42);
    av.lineStyle(4, 0xf5b52e, 1);
    av.strokeCircle(0, -128, 41);
    const name = d.name || 'Искатель Богов';
    const initials = name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    const avText = this.add.text(0, -127, initials, {
      fontFamily: RUSSO,
      fontSize: '30px',
      color: '#9dffce',
    }).setOrigin(0.5);
    items.push(av, avText);
    items.push(
      this.add.text(0, -66, name, { fontFamily: RUSSO, fontSize: '19px', color: '#f9ecc8' }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, -40, d.vkId ? `VK ID: ${d.vkId}` : 'Гость · данные ВК недоступны', {
        fontFamily: RUBIK,
        fontSize: '13px',
        color: '#8fd8b4',
      }).setOrigin(0.5),
    );

    const stats: [string, string][] = [
      ['Пройдено уровней', `${Math.min(d.level - 1, 24)} / 24`],
      ['Собрано звёзд', `${playerState.totalStars()} / 72`],
      ['Открыто сундуков', `${d.chests.length} / 4`],
      ['Монеты', fmtNum(d.coins)],
      ['Гемы', fmtNum(d.gems)],
    ];
    stats.forEach((s, i) => {
      const y = 4 + i * 34;
      items.push(
        this.add.text(-160, y, s[0], { fontFamily: RUBIK, fontSize: '15px', color: '#b9ad87' }).setOrigin(0, 0.5),
      );
      items.push(
        this.add.text(160, y, s[1], { fontFamily: RUSSO, fontSize: '15px', color: '#f9ecc8' }).setOrigin(1, 0.5),
      );
    });

    const syncBtn = makeButton(
      this,
      'СИНХРОНИЗИРОВАТЬ С ВК',
      async () => {
        await vk.saveCloud('montezuma_save_v1', playerState.data);
        sfx.play('chest');
        this.toast(vk.inVK ? 'Сохранено в облако ВК' : 'Локальный сейв обновлён');
      },
      { w: 340, h: 56, style: 'dark', font: 15 },
    ).setPosition(0, 190);
    items.push(syncBtn);
    pop.add(items);
  }

  // ---------------- Тосты ----------------

  toast(msg: string): void {
    const t = this.add.text(0, 1, msg, {
      fontFamily: RUBIK,
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#f9ecc8',
      wordWrap: { width: 380 },
      align: 'center',
    }).setOrigin(0.5);
    const w = Math.min(440, t.width + 44);
    const g = this.add.graphics();
    g.fillStyle(0x0a1c12, 0.96);
    roundedRectPath(g, -w / 2, -20, w, 40, 20);
    g.fillPath();
    g.lineStyle(2, 0xd9a52f, 0.9);
    roundedRectPath(g, -w / 2, -20, w, 40, 20);
    g.strokePath();
    const c = this.add.container(GAME_W / 2, 330, [g, t]).setDepth(950).setAlpha(0);
    this.toasts.push(c);
    if (this.toasts.length > 3) {
      const old = this.toasts.shift();
      old?.destroy();
    }
    this.toasts.forEach((tc, i) => {
      this.tweens.add({ targets: tc, y: 330 + i * 50, duration: 200, ease: 'Cubic.easeOut' });
    });
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        y: c.y - 24,
        duration: 250,
        onComplete: () => {
          c.destroy();
          this.toasts = this.toasts.filter((x) => x !== c);
        },
      });
    });
  }
}
