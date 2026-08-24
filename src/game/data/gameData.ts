// ============================================================
// Мок-данные игры «Лестница Бога»: уровни, главы, сундуки,
// акции и БОЕВЫЕ НАВЫКИ (аналог тотемов).
// В продакшене подменяются данными бэкенда / VK Bridge —
// формат интерфейсов сохраняется.
// ============================================================

export const GAME_W = 540;
export const GAME_H = 960;

export type FruitKind = 'apple' | 'orange' | 'grape' | 'banana' | 'lime' | 'berry';

export const FRUIT_KINDS: FruitKind[] = ['apple', 'orange', 'grape', 'banana', 'lime', 'berry'];

export const FRUIT_NAMES: Record<FruitKind, string> = {
  apple: 'Яблоко',
  orange: 'Апельсин',
  grape: 'Виноград',
  banana: 'Банан',
  lime: 'Лайм',
  berry: 'Ягода',
};

export const FRUIT_COLORS: Record<FruitKind, { main: number; light: number; dark: number }> = {
  apple: { main: 0xe8384f, light: 0xff97a8, dark: 0x8f0f26 },
  orange: { main: 0xff9020, light: 0xffcf8a, dark: 0xa34e00 },
  grape: { main: 0xb06bff, light: 0xe0bdff, dark: 0x5b21a8 },
  banana: { main: 0xffd23e, light: 0xfff0a8, dark: 0xb08a00 },
  lime: { main: 0x7ed321, light: 0xc8f58a, dark: 0x3a7a00 },
  berry: { main: 0x5a8bff, light: 0xa3c6ff, dark: 0x1c3a9e },
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
  | { type: 'collect'; kind: FruitKind; amount: number };

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

export function getLevels(): LevelDef[] {
  const levels: LevelDef[] = [];
  for (let id = 1; id <= 24; id++) {
    const boss = id % 8 === 0;
    let goal: GoalDef;
    if (boss) {
      const kind = FRUIT_KINDS[id === 8 ? 0 : id === 16 ? 2 : 5];
      goal = { type: 'collect', kind, amount: 18 + (id / 8) * 5 };
    } else if (id % 2 === 0) {
      const kind = FRUIT_KINDS[(id * 3 + 1) % 6];
      goal = { type: 'collect', kind, amount: 12 + Math.floor(id * 0.7) };
    } else {
      goal = { type: 'score', amount: 1100 + id * 140 };
    }
    levels.push({
      id,
      type: boss ? 'boss' : 'normal',
      name: LEVEL_NAMES[id - 1],
      moves: boss ? 26 : 18 + (id % 4) + (id > 16 ? 2 : 0),
      goal,
      parScore: 1500 + id * 120,
      rewardCoins: 45 + id * 5,
      rewardGems: id % 6 === 0 ? 2 : id % 3 === 0 ? 1 : 0,
      bossName: boss ? BOSS_NAMES[id] : undefined,
    });
  }
  return levels;
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
    desc: 'Новая коллекция фруктов уже ждёт в магазине',
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
    kind: 'apple',
    charge: 12,
    effect: 'blast',
    desc: 'Взрыв 3×3 в выбранной клетке',
    icon: 'skill_fire',
  },
  {
    id: 'bolt',
    name: 'НЕБЕСНАЯ МОЛНИЯ',
    kind: 'banana',
    charge: 12,
    effect: 'cross',
    desc: 'Молния бьёт крестом: весь ряд и колонка',
    icon: 'skill_bolt',
  },
  {
    id: 'wind',
    name: 'ДУХ ВЕТРА',
    kind: 'lime',
    charge: 14,
    effect: 'storm',
    desc: 'Ветер уносит все фрукты самого частого вида',
    icon: 'skill_wind',
  },
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
