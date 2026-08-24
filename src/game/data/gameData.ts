// ============================================================
// Мок-данные игры «Лестница Бога»: уровни, главы, сундуки,
// акции и БОЕВЫЕ НАВЫКИ (аналог тотемов).
// В продакшене подменяются данными бэкенда / VK Bridge —
// формат интерфейсов сохраняется.
// ============================================================

export const GAME_W = 540;
export const GAME_H = 960;

// 5 фишек. Ключи совпадают с именами файлов: fruits/0.png … fruits/4.png
export type FruitKind = '0' | '1' | '2' | '3' | '4';

export const FRUIT_KINDS: FruitKind[] = ['0', '1', '2', '3', '4'];

export const FRUIT_NAMES: Record<FruitKind, string> = {
  '0': 'Рубин',
  '1': 'Сапфир',
  '2': 'Изумруд',
  '3': 'Топаз',
  '4': 'Аметист',
};

// Цвета используются только для частиц, свечения и аур (сами фишки — твои PNG)
export const FRUIT_COLORS: Record<FruitKind, { main: number; light: number; dark: number }> = {
  '0': { main: 0xe8384f, light: 0xff97a8, dark: 0x8f0f26 },
  '1': { main: 0x5a8bff, light: 0xa3c6ff, dark: 0x1c3a9e },
  '2': { main: 0x7ed321, light: 0xc8f58a, dark: 0x3a7a00 },
  '3': { main: 0xffd23e, light: 0xfff0a8, dark: 0xb08a00 },
  '4': { main: 0xb06bff, light: 0xe0bdff, dark: 0x5b21a8 },
};

export const THEME = {
  gold: 0xf5b52e,
  goldDeep: 0xc98a12,
  jade: 0x2ee6a8,
  cream: '#f9ecc8',
  creamDim: '#c9b98f',
  red: 0xff5a5a,
};

export type GoalDef =
  | { type: 'score'; amount: number }
  | { type: 'collect'; kind: FruitKind; amount: number }
  | { type: 'relic'; amount: number }; // опусти идолов вниз

export interface ObstacleLayout {
  vines?: [number, number][]; // лианы: блокируют клетку, рвутся от матча рядом
  slabs?: [number, number][]; // плиты: 2 удара
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
}

export interface ChapterDef {
  from: number;
  to: number;
  title: string;
  num: string;
}

export const CHAPTERS: ChapterDef[] = [
  { from: 1, to: 8, title: 'СТУПЕНИ РАССВЕТА', num: 'Лестница I' },
  { from: 9, to: 16, title: 'ЛУННАЯ ТЕРРАСА', num: 'Лестница II' },
  { from: 17, to: 24, title: 'ОБИТЕЛЬ БОГОВ', num: 'Лестница III' },
];

const LEVEL_NAMES = [
  'Врата рассвета', 'Первая ступень', 'Тропа ветров', 'Сад птиц', 'Каменные стражи',
  'Колодец эха', 'Звёздная тропа', 'Хранитель лестницы',
  'Лунные ступени', 'Зал шёпотов', 'Серебряный мост', 'Терраса снов', 'Змеиный проём',
  'Обсерватория', 'Алтарь подношений', 'Жрец Луны',
  'Солнечные врата', 'Золотая терраса', 'Чертог грома', 'Сокровищница богов',
  'Мост над облаками', 'Сердце небес', 'Трон зарницы', 'Истукан Солнца',
];

const BOSS_NAMES: Record<number, string> = {
  8: 'Хранитель лестницы',
  16: 'Жрец Луны',
  24: 'Истукан Солнца',
};

// Препятствия и реликвии по уровням (чередование механик)
const VINES: Record<number, [number, number][]> = {
  3: [[3, 1], [3, 5]],
  4: [[2, 3], [4, 3]],
  6: [[2, 1], [2, 5], [4, 1], [4, 5]],
  9: [[3, 0], [3, 6], [5, 3]],
  13: [[2, 2], [2, 4], [5, 2], [5, 4]],
  17: [[1, 3], [3, 1], [3, 5], [5, 3]],
  19: [[2, 1], [2, 5], [4, 1], [4, 5]],
  21: [[2, 3], [4, 2], [4, 4]],
};
const SLABS: Record<number, [number, number][]> = {
  7: [[3, 2], [3, 4]],
  11: [[2, 2], [2, 4], [5, 3]],
  12: [[4, 1], [4, 5], [2, 3]],
  15: [[3, 3], [2, 1], [2, 5]],
  18: [[3, 0], [3, 6], [3, 3]],
  20: [[2, 2], [2, 4]],
  23: [[2, 1], [2, 5], [5, 1], [5, 5]],
};
// Уровни с целью «опусти идолов вниз»
const RELIC_LEVELS: Record<number, number> = { 5: 2, 10: 2, 14: 2, 20: 3, 22: 2 };

export function getLevels(): LevelDef[] {
  const levels: LevelDef[] = [];
  for (let id = 1; id <= 24; id++) {
    const boss = id % 8 === 0;
    let goal: GoalDef;
    if (boss) {
      const kind = FRUIT_KINDS[id === 8 ? 0 : id === 16 ? 2 : 4];
      goal = { type: 'collect', kind, amount: 18 + (id / 8) * 5 };
    } else if (RELIC_LEVELS[id]) {
      goal = { type: 'relic', amount: RELIC_LEVELS[id] };
    } else if (id % 2 === 0) {
      const kind = FRUIT_KINDS[(id * 3 + 1) % 5];
      goal = { type: 'collect', kind, amount: 12 + Math.floor(id * 0.7) };
    } else {
      goal = { type: 'score', amount: 1100 + id * 140 };
    }
    const obstacles: ObstacleLayout = {};
    if (VINES[id]) obstacles.vines = VINES[id];
    if (SLABS[id]) obstacles.slabs = SLABS[id];
    levels.push({
      id,
      type: boss ? 'boss' : 'normal',
      name: LEVEL_NAMES[id - 1],
      moves: boss ? 26 : 18 + (id % 4) + (id > 16 ? 2 : 0) + (RELIC_LEVELS[id] ? 4 : 0),
      goal,
      parScore: 1500 + id * 120,
      rewardCoins: 45 + id * 5,
      rewardGems: id % 6 === 0 ? 2 : id % 3 === 0 ? 1 : 0,
      bossName: boss ? BOSS_NAMES[id] : undefined,
      obstacles: obstacles.vines || obstacles.slabs ? obstacles : undefined,
    });
  }
  return levels;
}

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

export interface ChestDef {
  id: string;
  afterLevel: number;
  coins: number;
  gems: number;
  label: string;
}

export const CHESTS: ChestDef[] = [
  { id: 'chest_dawn', afterLevel: 6, coins: 200, gems: 2, label: 'Сундук рассвета' },
  { id: 'chest_moon', afterLevel: 12, coins: 350, gems: 4, label: 'Лунный сундук' },
  { id: 'chest_sun', afterLevel: 18, coins: 500, gems: 6, label: 'Солнечный сундук' },
  { id: 'chest_gods', afterLevel: 24, coins: 1000, gems: 12, label: 'Дар верховного бога' },
];

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

/** Позиция узла уровня на карте (index — 0-based). Путь идёт снизу вверх змейкой. */
export function nodePos(index: number): { x: number; y: number } {
  return {
    x: GAME_W / 2 + Math.sin(index * 0.95) * 158,
    y: -index * NODE_SPACING,
  };
}
