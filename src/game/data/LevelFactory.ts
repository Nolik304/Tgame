// ============================================================
// LevelFactory — бесконечная «Лестница Бога».
// Уровень НЕ хранится в массиве, а генерируется детерминированно
// из своего номера (seed = id): один и тот же уровень одинаков
// для всех игроков и в любой момент (важно для синка с ВК).
//
// СИСТЕМА ЭПОХ (каждые 100 уровней добавляются механики):
//   I    1–100   «Ступени Рассвета»  — база: очки/сбор, лианы, плиты, идолы
//   II   101–200 «Лунная Терраса»    — + ЛЁД на клетках
//   III  201–300 «Обитель Богов»     — + 6-й кристалл (Обсидиан) → поле злее
//   IV   301–400 «Небесная Кузня»    — + ДВОЙНЫЕ цели (собери 2 вида)
//   V    401–500 «Трон Вечности»     — ярость боссов (мороз чаще и шире)
//   500+ — формулы эпохи V продолжаются с мягким ростом сложности.
// ============================================================
import {
  FRUIT_KINDS,
  NODE_SPACING,
  type FruitKind,
  type GoalDef,
  type GoalPart,
  type LevelDef,
  type ObstacleLayout,
} from './gameData';

export interface EraDef {
  era: number;
  from: number;
  to: number;
  title: string;
  numeral: string;
  gemCount: number; // видов кристаллов на поле
  bossEvery: number; // каждый N-й уровень — босс
  bossFreezeEvery: number; // босс морозит каждые N ходов
  bossFreezeCount: number;
  vinesFrom: number; // уровень, с которого могут появляться лианы
  slabsFrom: number;
  iceFrom: number; // 0 = никогда
  relicFrom: number; // уровни с целью «опусти идолов»
  duoFrom: number; // 0 = никогда
  mechanicText: string; // показывается на первом уровне эпохи
}

export const ERAS: EraDef[] = [
  {
    era: 1, from: 1, to: 100,
    title: 'СТУПЕНИ РАССВЕТА', numeral: 'I',
    gemCount: 5, bossEvery: 25, bossFreezeEvery: 5, bossFreezeCount: 3,
    vinesFrom: 3, slabsFrom: 16, iceFrom: 0, relicFrom: 10, duoFrom: 0,
    mechanicText: 'Поднимись на 100 ступеней — впереди Лунная Терраса!',
  },
  {
    era: 2, from: 101, to: 200,
    title: 'ЛУННАЯ ТЕРРАСА', numeral: 'II',
    gemCount: 5, bossEvery: 25, bossFreezeEvery: 5, bossFreezeCount: 3,
    vinesFrom: 101, slabsFrom: 101, iceFrom: 105, relicFrom: 101, duoFrom: 0,
    mechanicText: 'Новое: ЛЁД! Матч рядом с клеткой растапливает его.',
  },
  {
    era: 3, from: 201, to: 300,
    title: 'ОБИТЕЛЬ БОГОВ', numeral: 'III',
    gemCount: 6, bossEvery: 20, bossFreezeEvery: 5, bossFreezeCount: 3,
    vinesFrom: 201, slabsFrom: 201, iceFrom: 201, relicFrom: 201, duoFrom: 0,
    mechanicText: 'Новое: на поле вышел 6-й кристалл — ОБСИДИАН!',
  },
  {
    era: 4, from: 301, to: 400,
    title: 'НЕБЕСНАЯ КУЗНЯ', numeral: 'IV',
    gemCount: 6, bossEvery: 20, bossFreezeEvery: 4, bossFreezeCount: 3,
    vinesFrom: 301, slabsFrom: 301, iceFrom: 301, relicFrom: 301, duoFrom: 305,
    mechanicText: 'Новое: ДВОЙНЫЕ цели — собери два вида кристаллов!',
  },
  {
    era: 5, from: 401, to: 500,
    title: 'ТРОН ВЕЧНОСТИ', numeral: 'V',
    gemCount: 6, bossEvery: 15, bossFreezeEvery: 4, bossFreezeCount: 4,
    vinesFrom: 401, slabsFrom: 401, iceFrom: 401, relicFrom: 401, duoFrom: 401,
    mechanicText: 'Боги в ярости: боссы морозят чаще и больше!',
  },
];

export function eraOf(id: number): EraDef {
  for (const e of ERAS) if (id >= e.from && id <= e.to) return e;
  return ERAS[ERAS.length - 1]; // 500+ — формулы продолжают работать
}

// ============================================================
// НАСТРОЙКА СЛОЖНОСТИ — крути эти числа, чтобы менять баланс.
//   movesStart/movesMin — диапазон выдаваемых ходов;
//   collectPerMove      — сколько кристаллов цели нужно СДАВАТЬ за ход
//                         (чем выше, тем меньше лишних ходов остаётся);
//   scorePerMove        — требуемых очков за ход;
//   obstacleDensity     — множитель количества препятствий.
// ============================================================
export const DIFFICULTY = {
  movesStart: 16,
  movesMin: 11,
  collectPerMove: 1.45, // база: цель ≈ ходы × это значение
  collectPerMoveMax: 2.15,
  scorePerMove: 108,
  scorePerMoveMax: 160,
  obstacleDensity: 1.0,
};

// ---------- Детерминированный RNG (mulberry32) ----------
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Банки слов для имён (по эпохам) ----------
const NAME_A = ['Врата', 'Зал', 'Тропа', 'Сад', 'Мост', 'Чертог', 'Алтарь', 'Терраса', 'Колодец', 'Пик', 'Пролом', 'Святилище'];
const NAME_B: Record<number, string[]> = {
  1: ['рассвета', 'ветров', 'птиц', 'стражей', 'эха', 'зари', 'росы', 'лиан', 'светлячков', 'камня', 'первого луча', 'тишины'],
  2: ['луны', 'шёпотов', 'снов', 'тумана', 'серебра', 'полнолуния', 'теней', 'звездопада', 'мороза', 'полуночи', 'серпа', 'затмения'],
  3: ['громов', 'солнца', 'пламени', 'небес', 'зарницы', 'орлов', 'клятв', 'триумфа', 'молний', 'высот', 'титанов', 'славы'],
  4: ['кузни', 'искр', 'раскалённых цепей', 'горнов', 'звона', 'металла', 'углей', 'наковальни', 'пепла', 'рун', 'клещей', 'золота'],
  5: ['вечности', 'трона', 'бездны', 'судьбы', 'первозданья', 'тьмы и света', 'истока', 'предела', 'бессмертия', 'мирозданья', 'последней двери', 'абсолюта'],
};

const BOSS_NAMES: Record<number, string[]> = {
  1: ['Хранитель лестницы', 'Страж рассвета', 'Каменный ревун', 'Древний идол'],
  2: ['Жрец Луны', 'Лунный голем', 'Пожиратель снов', 'Серебряный змей'],
  3: ['Солнечный истукан', 'Громовержец', 'Огненный титан', 'Крылатый страж'],
  4: ['Кузнец цепей', 'Раскалённый горн', 'Владыка искр', 'Железный колосс'],
  5: ['Тень Вечности', 'Пожиратель ступеней', 'Безликий судья', 'Страж абсолюта'],
};

// ---------- Кэш ----------
const cache = new Map<number, LevelDef>();

export function getLevel(id: number): LevelDef {
  const cached = cache.get(id);
  if (cached) return cached;
  const def = generateLevel(Math.max(1, id));
  cache.set(id, def);
  return def;
}

function generateLevel(id: number): LevelDef {
  const era = eraOf(id);
  const r = rng(id * 7919 + 131);
  const kinds = FRUIT_KINDS.slice(0, era.gemCount);
  const isBoss = id % era.bossEvery === 0;

  // ----- кривая сложности (0→1): быстрый рост в начале, плавный дальше -----
  const ramp = Math.min(1, id / 250);
  const earlyRamp = Math.min(1, id / 60);

  // ----- ходы: щедро только на первых трёх ступенях, дальше в обрез -----
  let moves: number;
  if (id <= 3) moves = 18; // онбординг
  else moves = Math.round(DIFFICULTY.movesStart - earlyRamp * 3 - Math.max(0, Math.min(1, (id - 60) / 240)) * 2);
  moves = Math.max(DIFFICULTY.movesMin, moves - Math.floor((era.era - 1) / 2));
  if (isBoss) moves = Math.max(15, moves + 3); // у боссов заморозка — даём запас

  // «сколько цели за ход» — растёт с уровнем: лишних ходов почти не остаётся
  const cpm = DIFFICULTY.collectPerMove + ramp * (DIFFICULTY.collectPerMoveMax - DIFFICULTY.collectPerMove);
  const spm = DIFFICULTY.scorePerMove + ramp * (DIFFICULTY.scorePerMoveMax - DIFFICULTY.scorePerMove);

  // ----- цель (привязана к числу ходов, чтобы была впритык) -----
  let goal: GoalDef;
  if (isBoss) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    goal = { type: 'collect', kind, amount: Math.min(42, Math.round(moves * (cpm - 0.25))) };
  } else if (id >= era.relicFrom && id % 9 === 5) {
    goal = { type: 'relic', amount: 2 + (era.era >= 3 ? 1 : 0) };
  } else if (id >= era.duoFrom && r() < 0.45) {
    const a = kinds[Math.floor(r() * kinds.length)];
    let b = kinds[Math.floor(r() * kinds.length)];
    if (b === a) b = kinds[(kinds.indexOf(a) + 1 + Math.floor(r() * (kinds.length - 1))) % kinds.length];
    const base = Math.round(moves * cpm * 0.62);
    goal = {
      type: 'duo',
      parts: [
        { kind: a, amount: base },
        { kind: b, amount: Math.max(8, base - 2) },
      ],
    };
  } else if (r() < 0.6) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    goal = { type: 'collect', kind, amount: Math.min(44, Math.round(moves * cpm)) };
  } else {
    goal = { type: 'score', amount: Math.round(moves * spm) };
  }

  // ----- препятствия (раньше и плотнее) -----
  const obstacles: ObstacleLayout = {};
  const addCells = (n: number, avoid: Set<string>): [number, number][] => {
    const cells: [number, number][] = [];
    let guard = 0;
    while (cells.length < n && guard++ < 60) {
      const rr = 1 + Math.floor(r() * 5); // строки 1..5 (не трогаем верх/низ)
      const cc = Math.floor(r() * 7);
      const key = `${rr},${cc}`;
      if (avoid.has(key)) continue;
      avoid.add(key);
      cells.push([rr, cc]);
    }
    return cells;
  };
  const used = new Set<string>();
  const den = DIFFICULTY.obstacleDensity;
  const vineN = id >= era.vinesFrom ? Math.min(6, Math.round((1 + Math.floor((id - era.vinesFrom) / 18) + (r() < 0.4 ? 1 : 0)) * den)) : 0;
  const slabN = id >= era.slabsFrom ? Math.min(4, Math.round((1 + Math.floor((id - era.slabsFrom) / 45) + (r() < 0.3 ? 1 : 0)) * den)) : 0;
  const iceN = id >= era.iceFrom ? Math.min(5, Math.round((1 + Math.floor((id - era.iceFrom) / 35) + (r() < 0.35 ? 1 : 0)) * den)) : 0;
  if (isBoss) {
    // у боссов чище поле — только лёгкие препятствия
    if (vineN > 0) obstacles.vines = addCells(Math.min(2, vineN), used);
  } else {
    if (vineN > 0) obstacles.vines = addCells(vineN, used);
    if (slabN > 0) obstacles.slabs = addCells(slabN, used);
    if (iceN > 0) obstacles.ice = addCells(iceN, used);
  }

  // ----- бонус ходов за сложные цели -----
  if (goal.type === 'relic') moves += 4;
  if (goal.type === 'duo') moves += 3;

  const rewardCoins = Math.floor((40 + Math.min(240, id * 1.5)) * (isBoss ? 1.6 : 1));
  const rewardGems = isBoss ? 2 + Math.floor(id / 125) : id % 25 === 0 ? 2 : id % 10 === 0 ? 1 : 0;

  const name = isBoss
    ? `Логово: ${BOSS_NAMES[era.era][Math.floor(r() * BOSS_NAMES[era.era].length)]}`
    : `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[era.era][Math.floor(r() * NAME_B[era.era].length)]}`;

  return {
    id,
    type: isBoss ? 'boss' : 'normal',
    name,
    moves,
    goal,
    parScore: 1400 + id * 9,
    rewardCoins,
    rewardGems,
    bossName: isBoss ? name.replace('Логово: ', '') : undefined,
    obstacles: obstacles.vines?.length || obstacles.slabs?.length || obstacles.ice?.length ? obstacles : undefined,
    gemCount: era.gemCount,
    era: era.era,
    eraTitle: era.title,
    bossFreezeEvery: era.bossFreezeEvery,
    bossFreezeCount: era.bossFreezeCount,
    newMechanic: id === era.from ? era.mechanicText : undefined,
  };
}

// ---------- Сундуки (после каждого босса) ----------

export interface ChestDef {
  id: string;
  afterLevel: number;
  coins: number;
  gems: number;
  label: string;
}

export function isBossLevel(id: number): boolean {
  return id % eraOf(id).bossEvery === 0;
}

/** Сундук, который открывается после босса на уровне bossLevel. */
export function chestForBossLevel(bossLevel: number): ChestDef {
  const era = eraOf(bossLevel);
  return {
    id: `chest_${bossLevel}`,
    afterLevel: bossLevel,
    coins: 150 + bossLevel * 4,
    gems: 2 + Math.floor(bossLevel / 50),
    label: `Сундук эпохи «${era.numeral}»`,
  };
}

// ---------- Геометрия карты ----------

/** Позиция узла уровня на карте (id начинается с 1). Путь идёт снизу вверх змейкой. */
export function nodePos(id: number): { x: number; y: number } {
  const index = id - 1;
  return {
    x: 270 + Math.sin(index * 0.95) * 158,
    y: -index * NODE_SPACING,
  };
}

// ---------- Сводка прогресса эпохи ----------

export function eraProgress(id: number): { done: number; total: number } {
  const era = eraOf(id);
  const from = era.from;
  return { done: Math.max(0, id - from), total: era.to - era.from + 1 };
}

export function goalText(goal: GoalDef): string {
  switch (goal.type) {
    case 'score':
      return `Набери ${goal.amount} очков`;
    case 'collect':
      return `Собери ${goal.amount} кристаллов`;
    case 'relic':
      return `Опусти ${goal.amount} идолов вниз`;
    case 'duo': {
      const [a, b] = goal.parts as [GoalPart, GoalPart];
      return `Собери ${a.amount} + ${b.amount} двух видов`;
    }
  }
}
