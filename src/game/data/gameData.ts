// ============================================================
// Мок-данные игры: уровни, главы, сундуки, акции.
// В продакшене подменяются данными бэкенда / VK Bridge —
// формат интерфейсов сохраняется.
// ============================================================

export const GAME_W = 540;
export const GAME_H = 960;

export type GemKind = 'ruby' | 'emerald' | 'sapphire' | 'topaz' | 'amethyst' | 'jade';

export const GEM_KINDS: GemKind[] = ['ruby', 'emerald', 'sapphire', 'topaz', 'amethyst', 'jade'];

export const GEM_COLORS: Record<GemKind, { main: number; light: number; dark: number }> = {
  ruby: { main: 0xe8384f, light: 0xff97a8, dark: 0x8f0f26 },
  emerald: { main: 0x2ecc71, light: 0xa4ffc9, dark: 0x0c6b38 },
  sapphire: { main: 0x3d7bff, light: 0xa3c6ff, dark: 0x16308f },
  topaz: { main: 0xffb020, light: 0xffe493, dark: 0x96590a },
  amethyst: { main: 0xb06bff, light: 0xe0bdff, dark: 0x5b21a8 },
  jade: { main: 0x35d0c0, light: 0xb0fff4, dark: 0x0f6e63 },
};

export const THEME = {
  bgDeep: '#081a10',
  bgMid: '#0d2818',
  gold: 0xf5b52e,
  goldDeep: 0xc98a12,
  jade: 0x2ee6a8,
  cream: '#f9ecc8',
  creamDim: '#c9b98f',
  red: 0xff5a5a,
};

export type GoalDef =
  | { type: 'score'; amount: number }
  | { type: 'collect'; kind: GemKind; amount: number };

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
  { from: 1, to: 8, title: 'ДЖУНГЛИ', num: 'Глава I' },
  { from: 9, to: 16, title: 'ХРАМ ЛУНЫ', num: 'Глава II' },
  { from: 17, to: 24, title: 'ПИРАМИДА СОЛНЦА', num: 'Глава III' },
];

const LEVEL_NAMES = [
  'Врата джунглей', 'Тропа лиан', 'Река Капок', 'Поляна светлячков', 'Каменные идолы',
  'Перевал ревунов', 'Гнездо кетцаля', 'Страж джунглей',
  'Лунные врата', 'Зал эха', 'Подземное озеро', 'Нефритовый склеп', 'Змеиный коридор',
  'Обсерватория звёзд', 'Алтарь подношений', 'Верховный жрец',
  'Солнечная лестница', 'Золотая терраса', 'Чертог тронов', 'Сокровищница империи',
  'Обсидиановый мост', 'Сердце пирамиды', 'Врата Монтесумы', 'Каменный колосс',
];

const BOSS_NAMES: Record<number, string> = {
  8: 'Страж джунглей',
  16: 'Верховный жрец Луны',
  24: 'Каменный колосс',
};

export function getLevels(): LevelDef[] {
  const levels: LevelDef[] = [];
  for (let id = 1; id <= 24; id++) {
    const boss = id % 8 === 0;
    let goal: GoalDef;
    if (boss) {
      const kind = GEM_KINDS[(id === 8 ? 0 : id === 16 ? 4 : 2)];
      goal = { type: 'collect', kind, amount: 18 + (id / 8) * 5 };
    } else if (id % 2 === 0) {
      const kind = GEM_KINDS[(id * 3 + 1) % 6];
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
  { id: 'chest_jungle', afterLevel: 6, coins: 200, gems: 2, label: 'Сундук джунглей' },
  { id: 'chest_moon', afterLevel: 12, coins: 350, gems: 4, label: 'Лунный сундук' },
  { id: 'chest_sun', afterLevel: 18, coins: 500, gems: 6, label: 'Солнечный сундук' },
  { id: 'chest_montezuma', afterLevel: 24, coins: 1000, gems: 12, label: 'Сокровищница Монтесумы' },
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
    title: 'Перья Кетцаля',
    desc: 'Новая коллекция самоцветов уже ждет в магазине',
    kind: 'collection',
    durationMin: 1440,
    accent: 0xb06bff,
    cta: 'В магазин',
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
