// ============================================================
// Состояние игрока: прогресс, валюты, жизни, бусты, настройки,
// ежедневные награды, коллекции, тотемы, лимиты рекламы.
// Хранение: защищённый localStorage + облако ВК (+ сервер).
// Подписка через onChange() — UI обновляется реактивно.
// ============================================================
import { vk, type VKProfile } from './VKBridgeService';
import {
  DAILY_REWARDS,
  CARDS,
  SET_REWARD,
  DUP_CARD_COINS,
  CARD_DROP_CHANCE,
  getEventStage,
} from '../data/gameData';
import {
  TOTEM_SAVE_DEFAULT,
  UPGRADE_COST,
  UPGRADE_RATE,
  type TotemId,
  type TotemSave,
} from '../data/TotemSystem';
import { SecureStorage } from './SecureStorage';
import { SafeKV } from './SafeKV';
import { api } from './ApiClient';

export interface Boosts {
  coins2x?: number; // unix ms, до какого момента активен буст
}

export interface Settings {
  sound: boolean;
  vibration: boolean;
}

export interface SaveData {
  coins: number;
  gems: number;
  lives: number;
  livesTs: number; // момент, от которого тикает восстановление
  level: number; // текущая (максимальная открытая) ступень
  stars: Record<string, number>; // levelId -> 1..3
  chests: string[]; // ids открытых сундуков
  boosts: Boosts;
  settings: Settings;
  name: string;
  photo: string;
  vkId: number;
  dailyStreak: number; // 1..7 — текущий день лестницы наград
  lastDaily: string; // 'YYYY-M-D' последнего сбора
  cards: Record<string, number>; // коллекция: cardId -> количество
  setsCompleted: number; // сколько полных сетов собрано
  event: { day: string; stage: number }; // ивент: день и пройденная ступень
  totems: Record<TotemId, TotemSave>; // прокачка тотемов
  gemAds: { day: string; count: number }; // реклама за гемы: день + счётчик
}

export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 5 * 60 * 1000; // 1 жизнь / 5 минут
export const GEM_AD_REWARD = 3;
export const GEM_AD_DAILY_LIMIT = 5;
const SAVE_KEY = 'stairway_gods_save_v1';

const DEFAULTS: SaveData = {
  coins: 300,
  gems: 12,
  lives: MAX_LIVES,
  livesTs: Date.now(),
  level: 1,
  stars: {},
  chests: [],
  boosts: {},
  settings: { sound: true, vibration: true },
  name: '',
  photo: '',
  vkId: 0,
  dailyStreak: 0,
  lastDaily: '',
  cards: {},
  setsCompleted: 0,
  event: { day: '', stage: 0 },
  totems: TOTEM_SAVE_DEFAULT(),
  gemAds: { day: '', count: 0 },
};

type Listener = () => void;

class PlayerState {
  data: SaveData;
  private listeners = new Set<Listener>();

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = SafeKV.get(SAVE_KEY);
      if (raw) {
        const parsed = SecureStorage.unseal<Partial<SaveData>>(raw);
        if (parsed) {
          const d: SaveData = {
            ...DEFAULTS,
            ...parsed,
            settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
            boosts: { ...(parsed.boosts ?? {}) },
            stars: { ...(parsed.stars ?? {}) },
            chests: [...(parsed.chests ?? [])],
            cards: { ...(parsed.cards ?? {}) },
            event: { ...DEFAULTS.event, ...(parsed.event ?? {}) },
            totems: { ...TOTEM_SAVE_DEFAULT(), ...(parsed.totems ?? {}) },
            gemAds: { ...DEFAULTS.gemAds, ...(parsed.gemAds ?? {}) },
          };
          return this.refill(d);
        }
      }
    } catch {
      /* битый сейв — начинаем заново */
    }
    return structuredClone(DEFAULTS);
  }

  /** Дозаправка жизней по прошедшему времени. */
  private refill(d: SaveData): SaveData {
    if (d.lives < MAX_LIVES) {
      const now = Date.now();
      const gained = Math.floor((now - d.livesTs) / LIFE_REGEN_MS);
      if (gained > 0) {
        d.lives = Math.min(MAX_LIVES, d.lives + gained);
        d.livesTs = d.lives >= MAX_LIVES ? now : d.livesTs + gained * LIFE_REGEN_MS;
      }
    } else {
      d.livesTs = Date.now();
    }
    return d;
  }

  save(): void {
    try {
      SafeKV.set(SAVE_KEY, SecureStorage.seal(this.data));
    } catch {
      /* приватный режим и т.п. */
    }
    void vk.saveCloud(SAVE_KEY, this.data);
    void api.pushProgress(this.data.vkId, this.data);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  // ---------- Валюты ----------
  addCoins(n: number): void {
    this.data.coins = Math.max(0, Math.min(999999, this.data.coins + n));
    this.save();
    this.emit();
  }

  addGems(n: number): void {
    this.data.gems = Math.max(0, Math.min(99999, this.data.gems + n));
    this.save();
    this.emit();
  }

  // ---------- Жизни ----------
  livesNow(): number {
    this.refill(this.data);
    return this.data.lives;
  }

  nextLifeInMs(): number {
    if (this.livesNow() >= MAX_LIVES) return 0;
    return Math.max(0, LIFE_REGEN_MS - (Date.now() - this.data.livesTs));
  }

  loseLife(): void {
    this.refill(this.data);
    if (this.data.lives === MAX_LIVES) this.data.livesTs = Date.now();
    this.data.lives = Math.max(0, this.data.lives - 1);
    this.save();
    this.emit();
  }

  addLife(): void {
    this.refill(this.data);
    this.data.lives = Math.min(MAX_LIVES, this.data.lives + 1);
    if (this.data.lives === MAX_LIVES) this.data.livesTs = Date.now();
    this.save();
    this.emit();
  }

  // ---------- Прогресс ----------
  starsOf(levelId: number): number {
    return this.data.stars[String(levelId)] ?? 0;
  }

  totalStars(): number {
    return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
  }

  completeLevel(levelId: number, stars: number, coins: number, gems: number): void {
    const prev = this.starsOf(levelId);
    if (stars > prev) this.data.stars[String(levelId)] = stars;
    if (levelId + 1 > this.data.level) this.data.level = levelId + 1;
    this.data.coins = Math.min(999999, this.data.coins + coins);
    this.data.gems = Math.min(99999, this.data.gems + gems);
    this.save();
    this.emit();
  }

  chestClaimed(id: string): boolean {
    return this.data.chests.includes(id);
  }

  claimChest(id: string, coins: number, gems: number): void {
    if (this.chestClaimed(id)) return;
    this.data.chests.push(id);
    this.data.coins = Math.min(999999, this.data.coins + coins);
    this.data.gems = Math.min(99999, this.data.gems + gems);
    this.save();
    this.emit();
  }

  // ---------- Бусты ----------
  boostActive(kind: keyof Boosts): boolean {
    const until = this.data.boosts[kind];
    return !!until && until > Date.now();
  }

  activateBoost(kind: keyof Boosts, minutes: number): void {
    this.data.boosts[kind] = Date.now() + minutes * 60_000;
    this.save();
    this.emit();
  }

  // ---------- Коллекция ----------
  cardsOf(id: string): number {
    return this.data.cards[id] ?? 0;
  }

  setProgress(): number {
    return CARDS.filter((c) => this.cardsOf(c.id) > 0).length;
  }

  /** Награда за победу: случайная карточка (или дубликат→монеты). */
  awardRandomCard(): { cardId: string; name: string; isNew: boolean; dupCoins: number } | null {
    const missing = CARDS.filter((c) => this.cardsOf(c.id) === 0);
    let card;
    let isNew = false;
    if (missing.length > 0) {
      card = missing[Math.floor(Math.random() * missing.length)];
      isNew = true;
    } else {
      if (Math.random() > CARD_DROP_CHANCE) return null;
      card = CARDS[Math.floor(Math.random() * CARDS.length)];
    }
    this.data.cards[card.id] = this.cardsOf(card.id) + 1;
    const dupCoins = isNew ? 0 : DUP_CARD_COINS;
    if (dupCoins) this.data.coins = Math.min(999999, this.data.coins + dupCoins);
    this.save();
    this.emit();
    return { cardId: card.id, name: card.name, isNew, dupCoins };
  }

  /** Если сет собран — списывает по 1 карте, выдаёт награду. */
  tryCompleteSet(): boolean {
    if (CARDS.some((c) => this.cardsOf(c.id) === 0)) return false;
    for (const c of CARDS) this.data.cards[c.id] -= 1;
    this.data.setsCompleted += 1;
    this.data.coins = Math.min(999999, this.data.coins + SET_REWARD.coins);
    this.data.gems = Math.min(99999, this.data.gems + SET_REWARD.gems);
    this.save();
    this.emit();
    return true;
  }

  // ---------- Мини-ивент (сбрасывается ежедневно) ----------
  eventStageNow(): number {
    if (this.data.event.day !== this.dayStr()) return 0;
    return this.data.event.stage;
  }

  completeEventStage(stage: number): { coins: number; gems: number } {
    const def = getEventStage(stage);
    this.data.event = { day: this.dayStr(), stage };
    this.data.coins = Math.min(999999, this.data.coins + def.rewardCoins);
    this.data.gems = Math.min(99999, this.data.gems + def.rewardGems);
    this.save();
    this.emit();
    return { coins: def.rewardCoins, gems: def.rewardGems };
  }

  // ---------- Ежедневный «Дар богов» ----------
  private dayStr(offsetDays = 0): string {
    const d = new Date(Date.now() - offsetDays * 86_400_000);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  canClaimDaily(): boolean {
    return this.data.lastDaily !== this.dayStr();
  }

  dailyDayNext(): number {
    if (!this.canClaimDaily()) return this.data.dailyStreak || 1;
    return this.data.lastDaily === this.dayStr(1) ? (this.data.dailyStreak % 7) + 1 : 1;
  }

  claimDaily(): { day: number; coins: number; gems: number } | null {
    if (!this.canClaimDaily()) return null;
    const day = this.dailyDayNext();
    const reward = DAILY_REWARDS[day - 1];
    this.data.dailyStreak = day;
    this.data.lastDaily = this.dayStr();
    this.data.coins = Math.min(999999, this.data.coins + reward.coins);
    this.data.gems = Math.min(99999, this.data.gems + reward.gems);
    this.save();
    this.emit();
    return { day, ...reward };
  }

  // ---------- Реклама за гемы (дневной лимит) ----------
  gemAdsLeft(): number {
    if (this.data.gemAds.day !== this.dayStr()) return GEM_AD_DAILY_LIMIT;
    return Math.max(0, GEM_AD_DAILY_LIMIT - this.data.gemAds.count);
  }

  watchGemAd(): void {
    if (this.data.gemAds.day !== this.dayStr()) this.data.gemAds = { day: this.dayStr(), count: 0 };
    this.data.gemAds.count += 1;
    this.data.gems = Math.min(99999, this.data.gems + GEM_AD_REWARD);
    this.save();
    this.emit();
  }

  // ---------- Тотемы ----------
  tryUpgradeTotem(
    id: TotemId,
    track: 'proc' | 'power', // ШАНС или СИЛА
    currency: 'gems' | 'coins',
  ): { success: boolean; affordable: boolean } {
    const totem = this.data.totems[id];
    const cost = UPGRADE_COST[currency];
    const rate = UPGRADE_RATE[currency];

    if (currency === 'gems') {
      if (this.data.gems < cost) return { success: false, affordable: false };
      this.data.gems -= cost;
    } else {
      if (this.data.coins < cost) return { success: false, affordable: false };
      this.data.coins -= cost;
    }

    const roll = Math.random() < rate;
    if (roll) {
      totem[track] = Math.min(10, totem[track] + 1);
    }
    this.save();
    this.emit();
    return { success: roll, affordable: true };
  }

  // ---------- Профиль / настройки ----------
  applyProfile(p: VKProfile): void {
    this.data.vkId = p.id;
    this.data.name = p.id ? `${p.firstName} ${p.lastName}`.trim() : 'Искатель Богов';
    this.data.photo = p.photo;
    this.save();
    this.emit();
  }

  setSetting(key: keyof Settings, value: boolean): void {
    this.data.settings[key] = value;
    this.save();
    this.emit();
  }

  reset(): void {
    SafeKV.remove(SAVE_KEY);
    this.data = structuredClone(DEFAULTS);
    this.save();
    this.emit();
  }
}

export const playerState = new PlayerState();
