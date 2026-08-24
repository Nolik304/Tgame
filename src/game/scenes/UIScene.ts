// ============================================================
// UIScene: HUD поверх карты и боя.
//  - хедер: аватар ВК, монеты/гемы/жизни (+таймер регенерации);
//  - блок «Акции и события» с ротацией и таймерами;
//  - кнопка ИГРАТЬ; модалки: уровень, сундук, магазин (только
//    реклама — без рублей), «Дар богов», ивент, тотемы,
//    настройки, профиль; тосты; перелёт монет.
// ============================================================
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  PROMOS,
  FRUIT_NAMES,
  DAILY_REWARDS,
  EVENT_NAME,
  EVENT_STAGES,
  getEventStage,
  type PromoDef,
} from '../data/gameData';
import { getLevel, eraOf, goalText as goalLabel, type ChestDef } from '../data/LevelFactory';
import {
  TOTEMS,
  PROC_TABLE,
  UPGRADE_COST,
  UPGRADE_RATE,
  totemStats,
  type TotemId,
} from '../data/TotemSystem';
import { playerState, MAX_LIVES, GEM_AD_REWARD } from '../services/PlayerState';
import { sfx } from '../services/SoundManager';
import { vk } from '../services/VKBridgeService';
import { Popup, Toggle, makeButton, makeIconButton, roundedRectPath, fmtNum, fmtTime } from '../ui/Modal';

const RUSSO = '"Russo One"';
const RUBIK = '"Rubik"';

export class UIScene extends Phaser.Scene {
  private modal: Popup | null = null;
  private unsub?: () => void;
  private hudVisible = true;
  private pendingCoinFly = 0;
  private dailyShown = false;

  // HUD
  private avatarContainer!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private livesTimerText!: Phaser.GameObjects.Text;
  private levelChipText!: Phaser.GameObjects.Text;
  private playSubText?: Phaser.GameObjects.Text;
  private boostChip?: Phaser.GameObjects.Container;
  private boostText?: Phaser.GameObjects.Text;
  private giftDot?: Phaser.GameObjects.Arc;

  // промо
  private promoIdx = 0;
  private promoEndsAt = new Map<string, number>();
  private promoContainer!: Phaser.GameObjects.Container;
  private promoTag?: Phaser.GameObjects.Text;
  private promoTitle?: Phaser.GameObjects.Text;
  private promoDesc?: Phaser.GameObjects.Text;
  private promoTimer?: Phaser.GameObjects.Text;
  private promoCta?: Phaser.GameObjects.Container;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.modal = null;
    this.buildHeader();
    this.buildPlayBlock();
    this.buildPromoBlock();

    this.events.on('openLevel', (id: number) => this.openLevelModal(id), this);
    this.events.on('openChest', (chest: ChestDef) => this.openChestModal(chest), this);
    this.events.on('toast', (m: string) => this.toast(m), this);
    this.events.on('hud', (v: boolean) => this.setHudVisible(v), this);
    this.events.on('coinFly', (n: number) => this.flyCoins(n), this);
    this.events.on('openTotem', (id: TotemId) => this.openTotemModal(id), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('openLevel');
      this.events.off('openChest');
      this.events.off('toast');
      this.events.off('hud');
      this.events.off('coinFly');
      this.events.off('openTotem');
      this.unsub?.();
    });

    this.unsub = playerState.onChange(() => {
      this.refreshHUD();
    });

    // таймер жизней / буста / промо
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.tick(),
    });

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

  private tick(): void {
    this.refreshHUD();
    if (this.boostChip) this.updateBoostChip();
    if (this.promoTimer) {
      const promo = PROMOS[this.promoIdx];
      const end = this.promoEndsAt.get(promo.id) ?? 0;
      const left = end - Date.now();
      this.promoTimer.setText(left > 0 ? fmtTime(left) : 'скоро');
    }
  }

  // ---------------- Видимость HUD / монеты ----------------

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

  private pop(obj: Phaser.GameObjects.GameObject): void {
    this.tweens.add({ targets: obj, scale: { from: 1.25, to: 1 }, duration: 240, ease: 'Back.easeOut' });
  }

  // ---------------- Хедер ----------------

  private buildHeader(): void {
    // аватар
    this.avatarContainer = this.add.container(46, 46);
    const ring = this.add.graphics();
    ring.fillStyle(0x123626, 1);
    ring.fillCircle(0, 0, 27);
    ring.lineStyle(3.5, 0xf5b52e, 1);
    ring.strokeCircle(0, 0, 26);
    this.avatarContainer.add(ring);
    const avHit = this.add.circle(0, 0, 30, 0x000000, 0).setInteractive({ useHandCursor: true });
    avHit.on('pointerup', () => this.openProfileModal());
    this.avatarContainer.add(avHit);
    this.nameText = this.add.text(84, 34, '', { fontFamily: RUSSO, fontSize: '12px', color: '#f9ecc8' });
    this.add.text(84, 50, 'профиль · статистика', { fontFamily: RUBIK, fontSize: '10px', color: '#71806f' });

    // пилюли ресурсов
    this.coinsText = this.makePill(334, 40, 108, 'coin');
    this.gemsText = this.makePill(458, 40, 74, 'gemIcon');
    this.livesText = this.makePill(150, 92, 92, 'heart');
    this.livesTimerText = this.add.text(210, 92, '', { fontFamily: RUBIK, fontSize: '10px', color: '#8fd8b4' }).setOrigin(0, 0.5);

    // чип уровня
    this.levelChipText = this.add.text(GAME_W / 2, 132, '', {
      fontFamily: RUSSO, fontSize: '13px', color: '#ffd76a',
    }).setOrigin(0.5);
  }

  private makePill(x: number, y: number, w: number, icon: string): Phaser.GameObjects.Text {
    const g = this.add.graphics();
    g.fillStyle(0x08190f, 0.92);
    roundedRectPath(g, x - w / 2, y - 19, w, 38, 19);
    g.fillPath();
    g.lineStyle(2.5, 0x2c5a40, 1);
    roundedRectPath(g, x - w / 2, y - 19, w, 38, 19);
    g.strokePath();
    this.add.image(x - w / 2 + 20, y, icon).setScale(0.62);
    const txt = this.add.text(x + 8, y + 1, '0', {
      fontFamily: RUSSO, fontSize: '15px', color: '#f9ecc8',
    }).setOrigin(0.5);
    return txt;
  }

  private refreshHUD(): void {
    const d = playerState.data;
    this.coinsText.setText(fmtNum(d.coins));
    this.gemsText.setText(fmtNum(d.gems));
    const lives = playerState.livesNow();
    this.livesText.setText(`${lives}/${MAX_LIVES}`);
    const wait = playerState.nextLifeInMs();
    this.livesTimerText.setText(wait > 0 ? `+1 через ${fmtTime(wait)}` : lives >= MAX_LIVES ? 'полный запас' : '');
    const cur = d.level;
    this.levelChipText.setText(`Ступень ${cur} · ${eraOf(cur).title}`);
    this.playSubText?.setText(`Ступень ${cur} — ${getLevel(cur).name}`);
    this.refreshProfile();
    this.updateBoostChip();
  }

  private refreshProfile(): void {
    const d = playerState.data;
    this.nameText.setText(d.name || 'Искатель Богов');
    // аватарка
    const old = this.avatarContainer.getAt(1) as Phaser.GameObjects.GameObject | undefined;
    if (old && (old as Phaser.GameObjects.Image).type === 'Image') old.destroy();
    if (d.photo) {
      this.load.image('__avatar__', d.photo);
      this.load.once('complete', () => {
        if (!this.scene.isActive('UIScene')) return;
        const img = this.add.image(0, 0, '__avatar__');
        const scale = 48 / Math.max(img.width, 1);
        img.setScale(scale);
        const mask = this.make.graphics({});
        mask.fillStyle(0xffffff);
        mask.fillCircle(0, 0, 24);
        img.setMask(mask.createGeometryMask());
        this.avatarContainer.addAt(img, 1);
      });
      this.load.start();
    }
  }

  private updateBoostChip(): void {
    const active = playerState.boostActive('coins2x');
    if (active && !this.boostChip) {
      this.boostChip = this.add.container(GAME_W / 2, 156);
      const g = this.add.graphics();
      g.fillStyle(0x3a2c08, 1);
      roundedRectPath(g, -84, -13, 168, 26, 13);
      g.fillPath();
      g.lineStyle(2, 0xf5b52e, 1);
      roundedRectPath(g, -84, -13, 168, 26, 13);
      g.strokePath();
      this.boostText = this.add.text(0, 1, 'x2 МОНЕТЫ · 0:00', {
        fontFamily: RUSSO, fontSize: '11px', color: '#ffd76a',
      }).setOrigin(0.5);
      this.boostChip.add([g, this.boostText]);
      this.tweens.add({ targets: this.boostChip, alpha: { from: 0.6, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
    }
    if (!active && this.boostChip) {
      this.boostChip.destroy();
      this.boostChip = undefined;
      this.boostText = undefined;
    }
    if (active && this.boostText) {
      const until = playerState.data.boosts.coins2x ?? 0;
      this.boostText.setText(`x2 МОНЕТЫ · ${fmtTime(until - Date.now())}`);
    }
  }

  // ---------------- Кнопка ИГРАТЬ ----------------

  private buildPlayBlock(): void {
    const c = this.add.container(GAME_W / 2, GAME_H - 118);
    const play = makeButton(this, 'ИГРАТЬ', () => {
      this.tryStartLevel(playerState.data.level);
    }, { w: 320, h: 84, style: 'gold', font: 28 });
    c.add(play);
    this.playSubText = this.add.text(0, 62, '', {
      fontFamily: RUBIK, fontSize: '12.5px', color: '#8fd8b4',
    }).setOrigin(0.5);
    c.add(this.playSubText);
    this.tweens.add({ targets: play, scale: { from: 1, to: 1.04 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private tryStartLevel(id: number): void {
    if (playerState.livesNow() <= 0) {
      sfx.play('invalid');
      this.toast('Нет жизней — подожди или посмотри рекламу в магазине');
      return;
    }
    this.scene.get('MapScene')?.events.emit('focusLevel', id);
    this.time.delayedCall(240, () => {
      this.scene.stop('MapScene');
      this.scene.start('GameScene', { levelId: id });
    });
  }

  // ---------------- Промо ----------------

  private buildPromoBlock(): void {
    this.promoContainer = this.add.container(GAME_W / 2, 214);
    const g = this.add.graphics();
    g.fillStyle(0x08190f, 0.92);
    roundedRectPath(g, -240, -34, 480, 68, 14);
    g.fillPath();
    this.promoContainer.add(g);
    const hit = this.add.rectangle(0, 0, 480, 68, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.openPromoModal(PROMOS[this.promoIdx]));
    this.promoContainer.add(hit);
    // ротация
    this.time.addEvent({
      delay: 7000,
      loop: true,
      callback: () => {
        if (!this.modal && this.hudVisible) {
          this.promoIdx = (this.promoIdx + 1) % PROMOS.length;
          this.drawPromo(this.promoIdx);
        }
      },
    });
  }

  private drawPromo(i: number): void {
    const promo = PROMOS[i];
    this.promoTag?.destroy();
    this.promoTitle?.destroy();
    this.promoDesc?.destroy();
    this.promoTimer?.destroy();
    this.promoCta?.destroy();

    if (!this.promoEndsAt.has(promo.id)) {
      this.promoEndsAt.set(promo.id, Date.now() + promo.durationMin * 60_000);
    }
    const g = this.add.graphics();
    g.lineStyle(2.5, promo.accent, 0.9);
    roundedRectPath(g, -240, -34, 480, 68, 14);
    g.strokePath();

    this.promoTag = this.add.text(-226, -24, promo.tag, { fontFamily: RUSSO, fontSize: '10px', color: '#0a1c12' });
    const tagBg = this.add.graphics();
    tagBg.fillStyle(promo.accent, 1);
    roundedRectPath(tagBg, -232, -29, this.promoTag.width + 12, 18, 6);
    tagBg.fillPath();

    this.promoTitle = this.add.text(-226, -4, promo.title, { fontFamily: RUSSO, fontSize: '16px', color: '#f9ecc8' });
    this.promoDesc = this.add.text(-226, 14, promo.desc, { fontFamily: RUBIK, fontSize: '11px', color: '#b9ad87' });
    const end = this.promoEndsAt.get(promo.id) ?? 0;
    this.promoTimer = this.add.text(120, -22, fmtTime(Math.max(0, end - Date.now())), {
      fontFamily: RUSSO, fontSize: '12px', color: '#ffd76a',
    }).setOrigin(0.5);
    this.promoCta = makeButton(this, promo.cta, () => this.openPromoModal(promo), {
      w: 150, h: 40, style: 'green', font: 12,
    }).setPosition(158, 10);

    this.promoContainer.add([g, tagBg, this.promoTag, this.promoTitle, this.promoDesc, this.promoTimer, this.promoCta]);
  }

  private openPromoModal(promo: PromoDef): void {
    this.closeModal();
    const pop = new Popup(this, 440, 420, promo.title);
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(
      this.add.text(0, -110, promo.desc, {
        fontFamily: RUBIK, fontSize: '16px', color: '#f9ecc8', wordWrap: { width: 360 }, align: 'center',
      }).setOrigin(0.5),
    );
    const end = this.promoEndsAt.get(promo.id) ?? 0;
    const timerTxt = this.add.text(0, -58, `До конца акции: ${fmtTime(Math.max(0, end - Date.now()))}`, {
      fontFamily: RUSSO, fontSize: '15px', color: '#ffd76a',
    }).setOrigin(0.5);
    items.push(timerTxt);
    const int = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => timerTxt.setText(`До конца акции: ${fmtTime(Math.max(0, end - Date.now()))}`),
    });
    pop.setCloseHandler(() => int.destroy());

    items.push(
      makeButton(this, promo.cta.toUpperCase(), () => {
        if (promo.kind === 'coins') {
          playerState.activateBoost('coins2x', 120);
          sfx.play('boost');
          this.toast('Буст x2 монет активен 2 часа!');
          pop.close();
        } else if (promo.kind === 'event') {
          pop.close();
          this.watchAdForGems(3);
        } else {
          pop.close();
          this.openShopModal();
        }
      }, { w: 340, h: 68, style: 'gold', font: 19 }).setPosition(0, 30),
    );
    items.push(
      makeButton(this, 'ЗАКРЫТЬ', () => pop.close(), { w: 340, h: 54, style: 'dark', font: 16 }).setPosition(0, 116),
    );
    pop.add(items);
  }

  private async watchAdForGems(gems: number): Promise<void> {
    this.toast('Показываем рекламу…');
    const ok = await vk.showRewardedAd();
    if (ok && this.scene.isActive('UIScene')) {
      playerState.addGems(gems);
      sfx.play('coin');
      this.toast(`+${gems} гемов!`);
    } else if (this.scene.isActive('UIScene')) {
      this.toast('Реклама не досмотрена — награда не выдана');
    }
  }

  // ---------------- Модалки ----------------

  private closeModal(): void {
    if (this.modal) {
      this.modal.close();
      this.modal = null;
    }
  }

  toast(msg: string): void {
    const t = this.add.text(GAME_W / 2, GAME_H - 216, msg, {
      fontFamily: RUBIK, fontSize: '14px', fontStyle: 'bold', color: '#04241a',
      backgroundColor: '#5df0b0', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(950);
    this.tweens.add({ targets: t, alpha: { from: 1, to: 0 }, y: GAME_H - 260, delay: 1400, duration: 400, onComplete: () => t.destroy() });
  }

  private openLevelModal(id: number): void {
    this.closeModal();
    const def = getLevel(id);
    const pop = new Popup(this, 460, 480, `СТУПЕНЬ ${def.id}`);
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];

    items.push(
      this.add.text(0, -160, def.name, { fontFamily: RUBIK, fontSize: '15px', fontStyle: 'bold', color: '#b9ad87' }).setOrigin(0.5),
    );
    items.push(
      this.add.text(0, -138, `Эпоха ${eraOf(def.id).numeral} · ${def.eraTitle}`, {
        fontFamily: RUBIK, fontSize: '11px', color: '#8fd8b4',
      }).setOrigin(0.5),
    );

    // цель
    if (def.goal.type === 'collect') {
      items.push(this.add.image(-150, -100, `fruit_${def.goal.kind}`).setScale(this.fitIcon(`fruit_${def.goal.kind}`, 40)));
    } else if (def.goal.type === 'relic') {
      items.push(this.add.image(-150, -100, 'idol').setScale(0.42));
    } else if (def.goal.type === 'duo') {
      const [a, b] = def.goal.parts;
      items.push(
        this.add.image(-166, -100, `fruit_${a.kind}`).setScale(this.fitIcon(`fruit_${a.kind}`, 34)),
        this.add.image(-134, -100, `fruit_${b.kind}`).setScale(this.fitIcon(`fruit_${b.kind}`, 34)),
      );
    } else {
      items.push(this.add.image(-150, -100, 'star').setScale(0.6).setTint(0xf5b52e));
    }
    items.push(
      this.add.text(16, -99, goalLabel(def.goal), {
        fontFamily: RUBIK, fontSize: '16px', fontStyle: 'bold', color: '#f9ecc8',
      }).setOrigin(0.5),
    );

    // ходы и награды
    items.push(
      this.add.text(0, -60, `Ходы: ${def.moves}`, { fontFamily: RUSSO, fontSize: '17px', color: '#9dffce' }).setOrigin(0.5),
    );
    items.push(
      this.add.image(-52, -24, 'coin').setScale(0.7),
      this.add.text(-32, -23, `+${def.rewardCoins}`, { fontFamily: RUSSO, fontSize: '15px', color: '#f9ecc8' }).setOrigin(0, 0.5),
    );
    if (def.rewardGems > 0) {
      items.push(
        this.add.image(40, -24, 'gemIcon').setScale(0.7),
        this.add.text(60, -23, `+${def.rewardGems}`, { fontFamily: RUSSO, fontSize: '15px', color: '#f9ecc8' }).setOrigin(0, 0.5),
      );
    }
    if (def.type === 'boss') {
      items.push(this.add.image(0, 22, 'skull').setScale(0.85));
      items.push(
        this.add.text(0, 68, `БОСС: ${def.bossName}`, { fontFamily: RUSSO, fontSize: '13px', color: '#ff8a76' }).setOrigin(0.5),
      );
    }
    if (def.newMechanic) {
      items.push(
        this.add.text(0, def.type === 'boss' ? 92 : 40, def.newMechanic, {
          fontFamily: RUBIK, fontSize: '12px', fontStyle: 'bold', color: '#ffd76a',
          wordWrap: { width: 380 }, align: 'center',
        }).setOrigin(0.5),
      );
    }

    const lives = playerState.livesNow();
    const y0 = def.type === 'boss' ? 128 : 96;
    items.push(
      makeButton(
        this,
        lives > 0 ? 'ИГРАТЬ · 1 жизнь' : 'НЕТ ЖИЗНЕЙ',
        () => {
          if (lives <= 0) {
            sfx.play('invalid');
            this.toast('Жизни восстановятся — или посмотри рекламу в магазине');
            return;
          }
          this.closeModal();
          this.tryStartLevel(def.id);
        },
        { w: 340, h: 66, style: lives > 0 ? 'green' : 'dark', font: 19, icon: 'heart' },
      ).setPosition(0, y0),
    );
    pop.add(items);
  }

  private openChestModal(chest: ChestDef): void {
    this.closeModal();
    const pop = new Popup(this, 420, 420, chest.label);
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];
    const spr = this.add.image(0, -84, 'chest').setScale(1.7);
    this.tweens.add({ targets: spr, angle: { from: -5, to: 5 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    items.push(spr);
    items.push(
      this.add.image(-56, 26, 'coin').setScale(0.85),
      this.add.text(-32, 27, `+${chest.coins}`, { fontFamily: RUSSO, fontSize: '19px', color: '#f9ecc8' }).setOrigin(0, 0.5),
      this.add.image(44, 26, 'gemIcon').setScale(0.85),
      this.add.text(68, 27, `+${chest.gems}`, { fontFamily: RUSSO, fontSize: '19px', color: '#f9ecc8' }).setOrigin(0, 0.5),
    );
    items.push(
      makeButton(this, 'ЗАБРАТЬ', () => {
        playerState.claimChest(chest.id, chest.coins, chest.gems);
        sfx.play('coin');
        this.toast(`Сундук открыт: +${chest.coins} монет, +${chest.gems} гемов`);
        this.scene.get('MapScene')?.events.emit('refreshChests');
        const em = this.add.particles(GAME_W / 2, GAME_H / 2 - 84, 'spark', {
          speed: { min: 120, max: 420 },
          scale: { start: 0.8, end: 0 },
          lifespan: 900,
          tint: [0xffd76a, 0x9dffce, 0xff97a8],
          gravityY: 300,
          emitting: false,
        }).setDepth(950);
        em.explode(40);
        this.time.delayedCall(1000, () => em.destroy());
        this.closeModal();
      }, { w: 320, h: 66, style: 'gold', font: 20 }).setPosition(0, 106),
    );
    pop.add(items);
  }

  // ---------------- «Дар богов» ----------------

  private openDailyModal(): void {
    this.closeModal();
    const pop = new Popup(this, 470, 480, 'ДАР БОГОВ');
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];
    const claimable = playerState.canClaimDaily();
    const dayNext = playerState.dailyDayNext();
    const streak = playerState.data.dailyStreak;

    items.push(
      this.add.text(0, -174, claimable ? 'Ежедневная лестница наград' : 'Сегодня дар уже получен', {
        fontFamily: RUBIK, fontSize: '14px', color: '#b9ad87',
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
        this.add.text(x, -134, `День ${day}`, { fontFamily: RUBIK, fontSize: '10px', color: isNext ? '#ffd76a' : '#8fd8b4' }).setOrigin(0.5),
      );
      items.push(this.add.image(x, -104, 'coin').setScale(0.55));
      items.push(this.add.text(x, -76, `${rew.coins}`, { fontFamily: RUSSO, fontSize: '12px', color: '#f9ecc8' }).setOrigin(0.5));
      if (rew.gems > 0) {
        items.push(this.add.image(x - 12, -54, 'gemIcon').setScale(0.42));
        items.push(this.add.text(x, -53, `+${rew.gems}`, { fontFamily: RUSSO, fontSize: '11px', color: '#9dffce' }).setOrigin(0, 0.5));
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
        fontFamily: RUBIK, fontSize: '14px', fontStyle: 'bold', color: '#f9ecc8',
      }).setOrigin(0.5),
    );

    items.push(
      makeButton(this, claimable ? `ЗАБРАТЬ ДЕНЬ ${dayNext}` : 'ПРИХОДИ ЗАВТРА', () => {
        const r = playerState.claimDaily();
        if (r) {
          sfx.play('chest');
          sfx.vibrate('medium');
          this.toast(`Дар богов: +${r.coins} монет${r.gems ? `, +${r.gems} гемов` : ''}`);
          this.giftDot?.destroy();
          this.giftDot = undefined;
          this.closeModal();
        } else {
          this.toast('Боги одарят тебя завтра');
        }
      }, { w: 340, h: 66, style: claimable ? 'gold' : 'dark', font: 19 }).setPosition(0, 74),
    );
    pop.add(items);
  }

  // ---------------- Магазин (только реклама) ----------------

  private openShopModal(): void {
    this.closeModal();
    const pop = new Popup(this, 460, 560, 'МАГАЗИН');
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];

    const section = (y: number, label: string) => {
      items.push(this.add.text(-210, y, label, { fontFamily: RUSSO, fontSize: '14px', color: '#8fd8b4' }));
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
      items.push(
        makeButton(this, `${fmtNum(pack.coins)} монет — ${pack.price} гемов`, () => {
          if (playerState.data.gems < pack.price) {
            sfx.play('invalid');
            this.toast('Не хватает гемов');
            return;
          }
          playerState.addGems(-pack.price);
          playerState.addCoins(pack.coins);
          sfx.play('coin');
          this.toast(`+${fmtNum(pack.coins)} монет!`);
        }, { w: 400, h: 52, style: 'dark', font: 16, icon: 'coin' }).setPosition(0, -204 + i * 60),
      );
    });

    section(-8, 'ГЕМЫ ЗА РЕКЛАМУ');
    const adsLeft = playerState.gemAdsLeft();
    items.push(
      makeButton(
        this,
        adsLeft > 0 ? `РЕКЛАМА — +${GEM_AD_REWARD} ГЕМА (${adsLeft} осталось)` : 'ЛИМИТ НА СЕГОДНЯ ИСЧЕРПАН',
        async () => {
          if (playerState.gemAdsLeft() <= 0) {
            sfx.play('invalid');
            this.toast('Лимит рекламы за день исчерпан — приходи завтра');
            return;
          }
          const ok = await vk.showRewardedAd();
          if (ok && this.scene.isActive('UIScene')) {
            playerState.watchGemAd();
            sfx.play('coin');
            this.toast(`+${GEM_AD_REWARD} гема за просмотр!`);
            this.closeModal();
            this.openShopModal();
          }
        },
        { w: 400, h: 52, style: 'green', font: 15, icon: 'gemIcon', disabled: adsLeft <= 0 },
      ).setPosition(0, 32),
    );

    section(88, 'БЕСПЛАТНО');
    items.push(
      makeButton(this, 'РЕКЛАМА — +50 МОНЕТ', async () => {
        const ok = await vk.showRewardedAd();
        if (ok && this.scene.isActive('UIScene')) {
          playerState.addCoins(50);
          sfx.play('coin');
          this.toast('+50 монет за просмотр!');
        }
      }, { w: 400, h: 52, style: 'green', font: 15, icon: 'coin' }).setPosition(0, 128),
    );
    items.push(
      makeButton(this, 'РЕКЛАМА — +1 ЖИЗНЬ', async () => {
        const ok = await vk.showRewardedAd();
        if (ok && this.scene.isActive('UIScene')) {
          playerState.addLife();
          sfx.play('heart');
          this.toast('+1 жизнь!');
        }
      }, { w: 400, h: 52, style: 'green', font: 15, icon: 'heart' }).setPosition(0, 188),
    );
    pop.add(items);
  }

  // ---------------- Ивент ----------------

  private openEventModal(): void {
    this.closeModal();
    const stage = playerState.eventStageNow();
    const done = stage >= EVENT_STAGES;
    const pop = new Popup(this, 470, 620, EVENT_NAME);
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.image(0, -230, 'bird').setScale(0.9));
    items.push(
      this.add.text(0, -178, done ? 'Ивент пройден сегодня! Жар-птица вернётся завтра.' : `Пройдено ступеней: ${stage} из ${EVENT_STAGES}`, {
        fontFamily: RUBIK, fontSize: '14px', fontStyle: 'bold', color: '#f9ecc8',
      }).setOrigin(0.5),
    );
    for (let s = 1; s <= EVENT_STAGES; s++) {
      const def = getEventStage(s);
      const y = -140 + (s - 1) * 38;
      const isNext = s === stage + 1 && !done;
      const isDone = s <= stage;
      items.push(
        this.add.text(-210, y, `${s}.`, { fontFamily: RUSSO, fontSize: '13px', color: isDone ? '#2ee6a8' : isNext ? '#ffd76a' : '#5f7a66' }),
      );
      items.push(
        this.add.text(-186, y, goalLabel(def.goal), {
          fontFamily: RUBIK, fontSize: '12px', color: isDone ? '#8fd8b4' : isNext ? '#f9ecc8' : '#5f7a66',
        }),
      );
      const rew = `+${def.rewardCoins} монет${def.rewardGems ? ` +${def.rewardGems} гемов` : ''}`;
      items.push(this.add.text(220, y, rew, { fontFamily: RUBIK, fontSize: '10.5px', color: isNext ? '#ffd76a' : '#5f7a66' }).setOrigin(1, 0));
    }
    items.push(
      makeButton(this, done ? 'ЗАВТРА ЕЩЁ!' : `ИГРАТЬ СТУПЕНЬ ${stage + 1}`, () => {
        if (done) {
          this.closeModal();
          return;
        }
        this.closeModal();
        this.scene.stop('MapScene');
        this.scene.start('GameScene', { eventStage: stage + 1 });
      }, { w: 360, h: 66, style: done ? 'dark' : 'gold', font: 19 }).setPosition(0, 254),
    );
    pop.add(items);
  }

  // ---------------- Тотемы ----------------

  private openTotemModal(sel: TotemId): void {
    this.closeModal();
    const pop = new Popup(this, 500, 700, 'ТОТЕМЫ БОГОВ');
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];

    const def = TOTEMS.find((t) => t.id === sel)!;
    const save = playerState.data.totems[sel];
    const stats = totemStats(sel, save);

    // вкладки
    TOTEMS.forEach((t, i) => {
      const x = (i - 1) * 130;
      const tab = this.add.container(x, -278);
      const bg = this.add.graphics();
      if (t.id === sel) {
        bg.fillStyle(0x123626, 1);
        roundedRectPath(bg, -56, -32, 112, 74, 12);
        bg.fillPath();
        bg.lineStyle(2.5, t.color, 1);
        roundedRectPath(bg, -56, -32, 112, 74, 12);
        bg.strokePath();
      }
      const icon = this.add.image(0, 0, t.icon).setScale(0.62);
      const label = this.add.text(0, 30, t.name.split(' ')[0], { fontFamily: RUSSO, fontSize: '11px', color: '#b9ad87' }).setOrigin(0.5);
      const hit = this.add.rectangle(0, 8, 118, 78, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        sfx.play('click');
        this.openTotemModal(t.id);
      });
      tab.add([bg, icon, label, hit]);
      items.push(tab);
    });

    items.push(this.add.text(0, -222, def.name, { fontFamily: RUSSO, fontSize: '19px', color: '#f5b52e' }).setOrigin(0.5));
    items.push(this.add.text(0, -198, def.desc, { fontFamily: RUBIK, fontSize: '12.5px', color: '#b9ad87' }).setOrigin(0.5));
    const statStr =
      sel === 'red'
        ? `Шанс ${stats.proc}% · взрыв ${stats.radius}×${stats.radius} · 2-й снаряд ${stats.extraBall}%`
        : sel === 'green'
          ? `Шанс ${stats.proc}% · +${stats.moves} хода`
          : `Шанс ${stats.proc}% · цепь ${stats.chain} фишек`;
    items.push(this.add.text(0, -176, statStr, { fontFamily: RUBIK, fontSize: '12.5px', fontStyle: 'bold', color: '#9dffce' }).setOrigin(0.5));

    // баланс
    items.push(
      this.add.image(-70, -150, 'gemIcon').setScale(0.5),
      this.add.text(-52, -149, `${fmtNum(playerState.data.gems)}`, { fontFamily: RUSSO, fontSize: '13px', color: '#f9ecc8' }).setOrigin(0, 0.5),
      this.add.image(30, -150, 'coin').setScale(0.5),
      this.add.text(48, -149, `${fmtNum(playerState.data.coins)}`, { fontFamily: RUSSO, fontSize: '13px', color: '#f9ecc8' }).setOrigin(0, 0.5),
    );

    const ratePct = (c: 'gems' | 'coins') => `${Math.round(UPGRADE_RATE[c] * 100)}%`;
    const tryBuy = (track: 'proc' | 'power', currency: 'gems' | 'coins') => {
      const res = playerState.tryUpgradeTotem(sel, track, currency);
      if (!res.affordable) {
        sfx.play('invalid');
        this.toast(currency === 'gems' ? 'Недостаточно гемов' : 'Недостаточно монет');
        return;
      }
      if (res.success) {
        sfx.play('chest');
        sfx.vibrate('medium');
        this.toast('УСПЕХ! Тотем усилен!');
      } else {
        sfx.play('invalid');
        sfx.vibrate('heavy');
        this.toast('Неудача… ресурсы потрачены');
      }
      this.openTotemModal(sel); // перерисовка
    };

    // две шкалы по 10 уровней
    const drawTrack = (label: string, track: 'proc' | 'power', current: number, baseY: number, value: (lv: number) => string) => {
      items.push(this.add.text(-228, baseY, label, { fontFamily: RUSSO, fontSize: '13px', color: '#f5b52e' }));
      const perRow = 5;
      for (let lv = 1; lv <= 10; lv++) {
        const idx = lv - 1;
        const x = -184 + (idx % perRow) * 92;
        const y = baseY + 32 + Math.floor(idx / perRow) * 60;
        const owned = current >= lv;
        const isNext = current === lv - 1;
        const cell = this.add.graphics();
        cell.fillStyle(owned ? 0x1d4a2e : 0x0c2417, 1);
        roundedRectPath(cell, x - 42, y - 24, 84, 48, 8);
        cell.fillPath();
        cell.lineStyle(2, owned ? 0x2ee6a8 : isNext ? 0xf5b52e : 0x2c5a40, owned || isNext ? 1 : 0.6);
        roundedRectPath(cell, x - 42, y - 24, 84, 48, 8);
        cell.strokePath();
        items.push(cell);
        items.push(
          this.add.text(x, y - 10, owned ? `${lv} ✓` : `${lv}`, {
            fontFamily: RUSSO, fontSize: '12px', color: owned ? '#9dffce' : '#f9ecc8',
          }).setOrigin(0.5),
        );
        items.push(
          this.add.text(x, y + 7, value(lv), { fontFamily: RUBIK, fontSize: '9px', color: '#8fd8b4' }).setOrigin(0.5),
        );
        if (isNext) {
          const hit = this.add.rectangle(x, y, 84, 48, 0x000000, 0).setInteractive({ useHandCursor: true });
          hit.on('pointerup', () => {
            const currency: 'gems' | 'coins' = playerState.data.gems >= UPGRADE_COST.gems ? 'gems' : 'coins';
            tryBuy(track, currency);
          });
          items.push(hit);
        }
      }
    };

    drawTrack('ШАНС СРАБАТЫВАНИЯ', 'proc', save.proc, -128, (lv) => `${PROC_TABLE[lv - 1]}%`);
    drawTrack(
      sel === 'red' ? 'СИЛА ВЗРЫВА' : sel === 'green' ? 'СИЛА ДАРА' : 'СИЛА ЦЕПИ',
      'power',
      save.power,
      18,
      (lv) =>
        sel === 'red'
          ? lv >= 8 ? '5×5' : lv >= 4 ? '4×4' : '3×3'
          : sel === 'green'
            ? `+${2 + Math.floor(lv / 2)} х.`
            : `${2 + lv} фишек`,
    );

    items.push(
      this.add.text(0, 288, `Улучшение: ${UPGRADE_COST.gems} гемов (шанс ${ratePct('gems')}) или ${UPGRADE_COST.coins} монет (${ratePct('coins')}).\nПри неудаче ресурсы сгорают.`, {
        fontFamily: RUBIK, fontSize: '10.5px', color: '#8a8468', align: 'center',
      }).setOrigin(0.5),
    );
    pop.add(items);
  }

  // ---------------- Настройки / профиль ----------------

  private openSettingsModal(): void {
    this.closeModal();
    const pop = new Popup(this, 420, 440, 'НАСТРОЙКИ');
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];
    const row = (y: number, label: string, value: boolean, cb: (v: boolean) => void) => {
      items.push(this.add.text(-160, y, label, { fontFamily: RUBIK, fontSize: '18px', fontStyle: 'bold', color: '#f9ecc8' }));
      const t = new Toggle(this, value, cb);
      t.container.setPosition(120, y);
      items.push(t.container);
    };
    row(-110, 'Звук', playerState.data.settings.sound, (v) => {
      playerState.setSetting('sound', v);
      if (v) sfx.play('click');
    });
    row(-50, 'Вибрация', playerState.data.settings.vibration, (v) => {
      playerState.setSetting('vibration', v);
      if (v) sfx.vibrate('light');
    });
    items.push(
      this.add.text(0, 10, 'Сейв: защищённый localStorage + облако ВК', { fontFamily: RUBIK, fontSize: '11.5px', color: '#8a8468' }).setOrigin(0.5),
    );
    items.push(
      makeButton(this, 'СБРОСИТЬ ПРОГРЕСС', () => {
        playerState.reset();
        sfx.play('invalid');
        this.toast('Прогресс сброшен');
        this.closeModal();
      }, { w: 340, h: 56, style: 'red', font: 16 }).setPosition(0, 92),
    );
    pop.add(items);
  }

  private openProfileModal(): void {
    this.closeModal();
    const d = playerState.data;
    const pop = new Popup(this, 440, 520, 'ПРОФИЛЬ');
    this.modal = pop;
    const items: Phaser.GameObjects.GameObject[] = [];

    // аватар
    const av = this.add.graphics();
    av.fillStyle(0x123626, 1);
    av.fillCircle(0, -128, 40);
    av.lineStyle(3.5, 0xf5b52e, 1);
    av.strokeCircle(0, -128, 41);
    items.push(av);
    if (d.photo) {
      this.load.image('__profile_av__', d.photo);
      this.load.once('complete', () => {
        if (!this.modal) return;
        const img = this.add.image(0, -128, '__profile_av__').setScale(72 / 100);
        const mask = this.make.graphics({});
        mask.fillStyle(0xffffff);
        mask.fillCircle(0, -128, 38);
        img.setMask(mask.createGeometryMask());
        pop.add(img);
      });
      this.load.start();
    }
    const name = d.name || 'Искатель Богов';
    items.push(this.add.text(0, -74, name, { fontFamily: RUSSO, fontSize: '19px', color: '#f9ecc8' }).setOrigin(0.5));
    items.push(this.add.text(0, -52, `VK ID: ${d.vkId || 'гость'}`, { fontFamily: RUBIK, fontSize: '12px', color: '#8a8468' }).setOrigin(0.5));

    const stats: [string, string][] = [
      ['Ступень', `${d.level}`],
      ['Всего звёзд', `${playerState.totalStars()}`],
      ['Коллекция', `${playerState.setProgress()}/8 карт`],
      ['Сетов собрано', `${d.setsCompleted}`],
      ['Монеты', fmtNum(d.coins)],
      ['Гемы', fmtNum(d.gems)],
    ];
    stats.forEach((s, i) => {
      const y = -20 + i * 36;
      items.push(
        this.add.text(-160, y, s[0], { fontFamily: RUBIK, fontSize: '15px', color: '#b9ad87' }).setOrigin(0, 0.5),
        this.add.text(160, y, s[1], { fontFamily: RUSSO, fontSize: '15px', color: '#f9ecc8' }).setOrigin(1, 0.5),
      );
      if (i < stats.length - 1) {
        const line = this.add.graphics();
        line.lineStyle(1, 0x1d4a2e, 1);
        line.lineBetween(-160, y + 18, 160, y + 18);
        items.push(line);
      }
    });
    pop.add(items);
  }

  /** Масштаб, приводящий PNG любого размера к нужной высоте (для иконок). */
  private fitIcon(key: string, targetPx: number): number {
    const tex = this.textures.get(key);
    if (!tex || tex.key === '__MISSING') return targetPx / 96;
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const w = src?.width || 96;
    return targetPx / w;
  }
}
