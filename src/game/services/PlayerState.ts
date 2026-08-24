// ============================================================
// Состояние игрока: прогресс, валюты, жизни, бусты, настройки,
// ежедневные награды. Хранение: localStorage + облако ВК.
// Подписка через onChange() — UI обновляется реактивно.
// ============================================================
import { vk, type VKProfile } from './VKBridgeService';
import { DAILY_REWARDS } from '../data/gameData';

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
  level: number; // текущий (максимальный открытый) уровень
  stars: Record<string, number>; // levelId -> 1..3
  chests: string[]; // ids открытых сундуков
  boosts: Boosts;
  settings: Settings;
  name: string;
  photo: string;
  vkId: number;
  dailyStreak: number; // 1..7 — текущий день лестницы наград
  lastDaily: string; // 'YYYY-M-D' последнего сбора
}

export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 5 * 60 * 1000; // 1 жизнь / 5 минут
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
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        const d: SaveData = {
          ...DEFAULTS,
          ...parsed,
          settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
          boosts: { ...(parsed.boosts ?? {}) },
          stars: { ...(parsed.stars ?? {}) },
          chests: [...(parsed.chests ?? [])],
        };
        return this.refill(d);
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
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* приватный режим и т.п. */
    }
    void vk.saveCloud(SAVE_KEY, this.data);
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

  // ---------- Ежедневный «Дар богов» ----------
  private dayStr(offsetDays = 0): string {
    const d = new Date(Date.now() - offsetDays * 86_400_000);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  canClaimDaily(): boolean {
    return this.data.lastDaily !== this.dayStr();
  }

  /** Какой день лестницы будет получен при следующем сборе (1..7). */
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
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.data = structuredClone(DEFAULTS);
    this.save();
    this.emit();
  }
}

export const playerState = new PlayerState();
