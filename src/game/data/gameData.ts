// ============================================================
// Мок-данные игры: кристаллы, главы-эпохи (в LevelFactory),
// сундуки (в LevelFactory), акции, коллекции, ивент, награды.
// В продакшене подменяются данными бэкенда / VK Bridge.
// ============================================================

export const GAME_W = 540;
export const GAME_H = 960;

/**
 * Кристаллы (фишки). Ключи '0'..'5' соответствуют файлам
 * public/fruits/0.png ... public/fruits/5.png — положи туда свои
 * спрайты (PNG с прозрачностью, размер любой — игра подстроит).
 */
export type FruitKind = '0' | '1' | '2' | '3' | '4' | '5';

export const FRUIT_KINDS: FruitKind[] = ['0', '1', '2', '3', '4'];

export const FRUIT_COLORS: Record<FruitKind, { main: number; light: number; dark: number }> = {
  '0': { main: 0xe8384f, light: 0xff97a8, dark: 0x8f0f26 },
  '1': { main: 0x3d7bff, light: 0xa3c6ff, dark: 0x16308f },
  '2': { main: 0x2ecc71, light: 0xa4ffc9, dark: 0x0c6b38 },
  '3': { main: 0xffb020, light: 0xffe493, dark: 0x96590a },
  '4': { main: 0xb06bff, light: 0xe0bdff, dark: 0x5b21a8 },
  '5': { main: 0x35d0c0, light: 0xb0fff4, dark: 0x0f6e63 },
};

export const FRUIT_NAMES: Record<FruitKind, string> = {
  '0': 'рубины',
  '1': 'сапфиры',
  '2': 'изумруды',
  '3': 'топазы',
  '4': 'аметисты',
  '5': 'обсидианы',
};

export const THEME = {
  gold: 0xf5b52e,
  goldDeep: 0xc98a12,
  jade: 0x2ee6a8,
  cream: '#f9ecc8',
  creamDim: '#c9b98f',
  red: 0xff5a5a,
};

// ---------- Цели уровней ----------

export interface GoalPart {
  kind: FruitKind;
  amount: number;
}

export type GoalDef =
  | { type: 'score'; amount: number }
  | { type: 'collect'; kind: FruitKind; amount: number }
  | { type: 'relic'; amount: number } // опусти идолов вниз
  | { type: 'duo'; parts: [GoalPart, GoalPart] }; // двойная цель (эпоха IV+)

export interface ObstacleLayout {
  vines?: [number, number][]; // лианы: блокируют клетку, рвутся от матча рядом
  slabs?: [number, number][]; // плиты: 2 удара
  ice?: [number, number][]; // лёд: замораживает фрукт (эпоха II+)
}

export interface LevelDef {
  id: number;
  type: 'normal' | 'boss';
  name: string;
  moves: number;
  goal: GoalDef;
  parScore: number;
  rewardCoins: number;
  rewardGems: number;
  bossName?: string;
  obstacles?: ObstacleLayout;
  // ----- генерируется LevelFactory -----
  gemCount: number; // сколько видов кристаллов на поле (5 или 6)
  era: number; // номер эпохи (1..5)
  eraTitle: string;
  bossFreezeEvery?: number; // босс морозит каждые N ходов
  bossFreezeCount?: number; // сколько клеток морозит
  newMechanic?: string; // подсказка на первом уровне эпохи
}

// Уровни генерируются бесконечно и детерминированно — см. LevelFactory.ts

// ---------- Акции ----------

export interface PromoDef {
  id: string;
  tag: string;
  title: string;
  desc: string;
  kind: 'coins' | 'collection' | 'event';
  durationMin: number;
  accent: number;
  cta: string;
}

export const PROMOS: PromoDef[] = [
  {
    id: 'promo_coins2x',
    tag: 'СОБЫТИЕ',
    title: 'Двойные монеты',
    desc: 'x2 монеты за прохождение ступеней — только 2 часа!',
    kind: 'coins',
    durationMin: 120,
    accent: 0xf5b52e,
    cta: 'Активировать x2',
  },
  {
    id: 'promo_gift',
    tag: 'ПОДАРОК',
    title: 'Дар богов',
    desc: 'Посмотри короткую рекламу и забери 3 гема',
    kind: 'event',
    durationMin: 360,
    accent: 0x35d0c0,
    cta: 'Смотреть рекламу',
  },
  {
    id: 'promo_collection',
    tag: 'КОЛЛЕКЦИЯ',
    title: 'Перья Солнечной птицы',
    desc: 'Новая коллекция самоцветов уже ждёт в магазине',
    kind: 'collection',
    durationMin: 1440,
    accent: 0xb06bff,
    cta: 'В магазин',
  },
];

// ---------- Ежедневный «Дар богов» (7 дней) ----------

export const DAILY_REWARDS = [
  { coins: 100, gems: 0 },
  { coins: 150, gems: 0 },
  { coins: 200, gems: 1 },
  { coins: 250, gems: 0 },
  { coins: 300, gems: 2 },
  { coins: 400, gems: 0 },
  { coins: 500, gems: 3 },
];

// ---------- Коллекция «Солнечная» ----------

export interface CardDef {
  id: string;
  name: string;
}

export const CARDS: CardDef[] = [
  { id: 'feather', name: 'Перо Кетцаля' },
  { id: 'mask', name: 'Золотая маска' },
  { id: 'sun', name: 'Солнечный диск' },
  { id: 'moon', name: 'Лунный камень' },
  { id: 'idolcard', name: 'Нефритовый идол' },
  { id: 'blade', name: 'Обсидиан. клинок' },
  { id: 'snake', name: 'Амулет змеи' },
  { id: 'eyecard', name: 'Око бога' },
];

export const SET_REWARD = { coins: 500, gems: 10 };
export const DUP_CARD_COINS = 30;
export const CARD_DROP_CHANCE = 0.45; // шанс дубликата, когда сет уже собран

// ---------- Мини-ивент «Восхождение Жар-птицы» ----------

export const EVENT_NAME = 'ВОСХОЖДЕНИЕ ЖАР-ПТИЦЫ';
export const EVENT_STAGES = 10;

export interface EventStageDef {
  moves: number;
  goal: GoalDef;
  rewardCoins: number;
  rewardGems: number; // подарок на рубежах 3 / 6 / 10
}

export function getEventStage(stage: number): EventStageDef {
  const goal: GoalDef =
    stage % 2 === 1
      ? { type: 'score', amount: 1000 + stage * 180 }
      : { type: 'collect', kind: FRUIT_KINDS[stage % 5], amount: 9 + stage };
  return {
    moves: 14 + Math.ceil(stage / 2),
    goal,
    rewardCoins: 40 + stage * 30,
    rewardGems: stage === 3 ? 2 : stage === 6 ? 4 : stage === 10 ? 8 : 0,
  };
}

// ---------- Геометрия карты ----------

export const NODE_SPACING = 150;

// Позиции узлов карты — см. LevelFactory.nodePos (id начинается с 1)
