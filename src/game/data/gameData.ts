// ============================================================
// Мок-данные игры «Лестница Бога»: уровни, главы, сундуки,
// акции и БОЕВЫЕ НАВЫКИ (аналог тотемов).
// В продакшене подменяются данными бэкенда / VK Bridge —
// формат интерфейсов сохраняется.
// ============================================================

export const GAME_W = 540;
export const GAME_H = 960;

// 6 видов кристаллов. Ключи = имена файлов: fruits/0.png … fruits/5.png
// 6-й («Обсидиан») появляется только с эпохи III (201+ уровень) — см. LevelFactory.
export type FruitKind = '0' | '1' | '2' | '3' | '4' | '5';

export const FRUIT_KINDS: FruitKind[] = ['0', '1', '2', '3', '4', '5'];

export const FRUIT_NAMES: Record<FruitKind, string> = {
  '0': 'Рубин',
  '1': 'Сапфир',
  '2': 'Изумруд',
  '3': 'Топаз',
  '4': 'Аметист',
  '5': 'Обсидиан',
};

// Цвета используются только для частиц, свечения и аур (сами фишки — твои PNG)
export const FRUIT_COLORS: Record<FruitKind, { main: number; light: number; dark: number }> = {
  '0': { main: 0xe8384f, light: 0xff97a8, dark: 0x8f0f26 },
  '1': { main: 0x5a8bff, light: 0xa3c6ff, dark: 0x1c3a9e },
  '2': { main: 0x7ed321, light: 0xc8f58a, dark: 0x3a7a00 },
  '3': { main: 0xffd23e, light: 0xfff0a8, dark: 0xb08a00 },
  '4': { main: 0xb06bff, light: 0xe0bdff, dark: 0x5b21a8 },
  '5': { main: 0x4e6076, light: 0xb8cede, dark: 0x121a24 },
};

export const THEME = {
  gold: 0xf5b52e,
  goldDeep: 0xc98a12,
  jade: 0x2ee6a8,
  cream: '#f9ecc8',
  creamDim: '#c9b98f',
  red: 0xff5a5a,
};

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
  ice?: [number, number][]; // лёд: блокирует клетку, тает от матча рядом (эпоха II+)
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

// Главы/эпохи теперь живут в LevelFactory.ts (бесконечная лестница)

// Уровни генерируются бесконечно и детерминированно — см. LevelFactory.ts
// (эпохи каждые 100 уровней: новые механики, цели, препятствия, награды).

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

// Сундуки теперь генерируются после каждого босса — см. LevelFactory.chestForBossLevel

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
    desc: 'x2 монеты за прохождение уровней — только 2 часа!',
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

// ---------- Боевые навыки (аналог тотемов) ----------

export type SkillEffect = 'blast' | 'cross' | 'storm';

export interface SkillDef {
  id: string;
  name: string;
  /** каким фруктом заряжается */
  kind: FruitKind;
  /** сколько фруктов нужно собрать для заряда */
  charge: number;
  effect: SkillEffect;
  desc: string;
  icon: string;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'fire',
    name: 'ОГОНЬ БОГОВ',
    kind: '0',
    charge: 12,
    effect: 'blast',
    desc: 'Взрыв 3×3 в выбранной клетке',
    icon: 'skill_fire',
  },
  {
    id: 'bolt',
    name: 'НЕБЕСНАЯ МОЛНИЯ',
    kind: '3',
    charge: 12,
    effect: 'cross',
    desc: 'Молния бьёт крестом: весь ряд и колонка',
    icon: 'skill_bolt',
  },
  {
    id: 'wind',
    name: 'ДУХ ВЕТРА',
    kind: '4',
    charge: 14,
    effect: 'storm',
    desc: 'Ветер уносит все фишки самого частого вида',
    icon: 'skill_wind',
  },
];

// ---------- Ежедневные награды «Дар богов» ----------

export const DAILY_REWARDS: { coins: number; gems: number }[] = [
  { coins: 60, gems: 0 },
  { coins: 90, gems: 0 },
  { coins: 120, gems: 1 },
  { coins: 160, gems: 1 },
  { coins: 220, gems: 2 },
  { coins: 300, gems: 3 },
  { coins: 500, gems: 5 },
];

// ---------- Геометрия карты ----------

export const NODE_SPACING = 150;

// Позиции узлов карты — см. LevelFactory.nodePos (id начинается с 1)
