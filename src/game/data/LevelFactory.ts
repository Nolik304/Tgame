// ============================================================
// БЕСКОНЕЧНАЯ ЛЕСТНИЦА: уровни генерируются детерминированно
// по номеру (seed = id). Эпохи по 100 уровней, у каждой —
// свои механики, палитра сложности и награды. После 500 формулы
// продолжают работать бесконечно.
// ============================================================
import { GAME_W, NODE_SPACING, FRUIT_KINDS, FRUIT_NAMES } from './gameData';
import type { GoalDef, LevelDef, ObstacleLayout } from './gameData';

export interface EraDef {
  num: number; // 1..5
  numeral: string;
  title: string;
  from: number;
  to: number;
  gemCount: number; // 5 или 6
  bossFreezeEvery: number;
  bossFreezeCount: number;
  mechanic: string; // подсказка на первом уровне эпохи
}

export const ERAS: EraDef[] = [
  {
    num: 1, numeral: 'I', title: 'СТУПЕНИ РАССВЕТА', from: 1, to: 100, gemCount: 5,
    bossFreezeEvery: 6, bossFreezeCount: 2,
    mechanic: 'Лианы и плиты мешают — рви их матчами рядом!',
  },
  {
    num: 2, numeral: 'II', title: 'ЛУННАЯ ТЕРРАСА', from: 101, to: 200, gemCount: 5,
    bossFreezeEvery: 5, bossFreezeCount: 3,
    mechanic: 'НОВАЯ МЕХАНИКА: лёд! Матч рядом растапливает клетку.',
  },
  {
    num: 3, numeral: 'III', title: 'ОБИТЕЛЬ БОГОВ', from: 201, to: 300, gemCount: 6,
    bossFreezeEvery: 5, bossFreezeCount: 3,
    mechanic: 'НОВАЯ МЕХАНИКА: 6-й кристалл — обсидиан!',
  },
  {
    num: 4, numeral: 'IV', title: 'НЕБЕСНАЯ КУЗНЯ', from: 301, to: 400, gemCount: 6,
    bossFreezeEvery: 4, bossFreezeCount: 4,
    mechanic: 'НОВАЯ МЕХАНИКА: двойные цели — собери два вида!',
  },
  {
    num: 5, numeral: 'V', title: 'ТРОН ВЕЧНОСТИ', from: 401, to: 500, gemCount: 6,
    bossFreezeEvery: 4, bossFreezeCount: 4,
    mechanic: 'Ярость богов: боссы бьют чаще и больнее!',
  },
];

export function eraOf(id: number): EraDef {
  if (id <= 500) return ERAS[Math.floor((id - 1) / 100)];
  return ERAS[4];
}

// ---------- Детерминированный ГПСЧ (mulberry32) ----------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- Словари имён ----------

const NAME_A = ['Врата', 'Ступень', 'Тропа', 'Сад', 'Зал', 'Мост', 'Терраса', 'Чертог', 'Колодец', 'Алтарь', 'Сердце', 'Пик'];
const NAME_B = ['рассвета', 'ветров', 'птиц', 'стражей', 'эха', 'звёзд', 'луны', 'снов', 'грома', 'солнца', 'облаков', 'вечности'];
const BOSS_A = ['Хранитель', 'Жрец', 'Истукан', 'Страж', 'Демон', 'Владыка'];
const BOSS_B = ['лестницы', 'Луны', 'Солнца', 'ступеней', 'грома', 'вечности'];

// ---------- Баланс (единый конфиг сложности) ----------
// Подкручивай здесь, если уровни слишком лёгкие/жёсткие.

const BAL = {
  movesBase: 15, // база ходов (было 19)
  movesPerLevel: 0.02, // медленный рост
  movesMax: 22,
  movesMin: 11,
  scoreBase: 1300,
  scorePerLevel: 12,
  collectBase: 13, // цель «собери» (было 11)
  collectPerLevel: 0.12,
  collectMax: 30,
  relicBase: 2,
  bossCollectBase: 17,
  bossCollectPerEra: 4,
};

function goalFor(id: number, era: EraDef, boss: boolean, rand: () => number): GoalDef {
  const kinds = FRUIT_KINDS.slice(0, era.gemCount);
  const pick = () => kinds[Math.floor(rand() * kinds.length)];
  if (boss) {
    return { type: 'collect', kind: pick(), amount: BAL.bossCollectBase + (era.num - 1) * BAL.bossCollectPerEra };
  }
  const roll = rand();
  if (era.num >= 4 && roll < 0.3) {
    const a = pick();
    let b = pick();
    let guard = 0;
    while (b === a && guard++ < 8) b = pick();
    const q = Math.round((BAL.collectBase + id * BAL.collectPerLevel) * 0.65);
    return { type: 'duo', parts: [{ kind: a, amount: q }, { kind: b, amount: q }] };
  }
  if (roll < 0.55) {
    return {
      type: 'collect',
      kind: pick(),
      amount: clamp(Math.round(BAL.collectBase + id * BAL.collectPerLevel), 8, BAL.collectMax),
    };
  }
  if (roll < 0.72) {
    return { type: 'relic', amount: BAL.relicBase + (era.num >= 3 ? 1 : 0) };
  }
  return { type: 'score', amount: BAL.scoreBase + id * BAL.scorePerLevel + era.num * 300 };
}

function obstaclesFor(id: number, era: EraDef, boss: boolean, rand: () => number): ObstacleLayout | undefined {
  if (boss) return undefined; // боссы морозят сами
  const pos = ((id - 1) % 100) + 1; // 1..100 внутри эпохи
  const out: ObstacleLayout = {};
  const spots: [number, number][] = [];
  const used = new Set<string>();
  const take = (n: number) => {
    const res: [number, number][] = [];
    let guard = 0;
    while (res.length < n && guard++ < 60) {
      const r = 1 + Math.floor(rand() * 6); // строки 1..6 (низ поля почти свободен)
      const c = Math.floor(rand() * 7);
      const k = `${r},${c}`;
      if (!used.has(k)) {
        used.add(k);
        res.push([r, c]);
      }
    }
    return res;
  };

  // лианы — с первых уровней
  if (pos >= 2 && pos % 2 === 0) {
    const n = clamp(1 + Math.floor(pos / 25) + (era.num >= 3 ? 1 : 0), 1, 5);
    out.vines = take(n);
  }
  // плиты — с 5-го уровня эпохи
  if (pos >= 5 && pos % 5 === 0) {
    const n = clamp(Math.floor(pos / 30) + (era.num >= 2 ? 1 : 0), 1, 4);
    out.slabs = take(n);
  }
  // лёд — со 2-й эпохи
  if (era.num >= 2 && pos >= 8 && pos % 4 === 0) {
    const n = clamp(Math.floor(pos / 35) + 1, 1, 4);
    out.ice = take(n);
  }
  void spots;
  return out.vines || out.slabs || out.ice ? out : undefined;
}

export function getLevel(id: number): LevelDef {
  const era = eraOf(id);
  const boss = id % 8 === 0;
  const rand = rng(id * 2654435761 + 13);
  const pos = ((id - 1) % 100) + 1;

  let moves = Math.round(BAL.movesBase + id * BAL.movesPerLevel - era.num * 0.5);
  moves = clamp(moves, BAL.movesMin, BAL.movesMax);
  if (boss) moves += 6;

  const goal = goalFor(id, era, boss, rand);
  if (goal.type === 'relic') moves += 3;

  const obstacles = obstaclesFor(id, era, boss, rand);

  return {
    id,
    type: boss ? 'boss' : 'normal',
    name: `${NAME_A[Math.floor(rand() * NAME_A.length)]} ${NAME_B[Math.floor(rand() * NAME_B.length)]}`,
    moves,
    goal,
    parScore: 1400 + id * 10 + era.num * 400,
    rewardCoins: 40 + Math.round(id * 1.6),
    rewardGems: id % 6 === 0 ? 2 : id % 3 === 0 ? 1 : 0,
    bossName: boss ? `${BOSS_A[(id / 8 + era.num) % BOSS_A.length | 0]} ${BOSS_B[(id / 8 + era.num) % BOSS_B.length | 0]}` : undefined,
    obstacles,
    gemCount: era.gemCount,
    era: era.num,
    eraTitle: era.title,
    bossFreezeEvery: era.bossFreezeEvery,
    bossFreezeCount: era.bossFreezeCount,
    newMechanic: pos === 1 && era.num > 1 ? era.mechanic : undefined,
  };
}

/** Человекочитаемое описание цели. */
export function goalText(goal: GoalDef): string {
  switch (goal.type) {
    case 'score':
      return `Набери ${goal.amount} очков`;
    case 'collect':
      return `Собери ${goal.amount} × ${FRUIT_NAMES[goal.kind]}`;
    case 'relic':
      return `Опусти ${goal.amount} идола вниз`;
    case 'duo': {
      const [a, b] = goal.parts;
      return `${a.amount}×${FRUIT_NAMES[a.kind]} + ${b.amount}×${FRUIT_NAMES[b.kind]}`;
    }
  }
}

// ---------- Геометрия карты ----------

export function nodePos(id: number): { x: number; y: number } {
  const index = id - 1;
  return {
    x: GAME_W / 2 + Math.sin(index * 0.95) * 158,
    y: -index * NODE_SPACING,
  };
}

// ---------- Сундуки ----------

export interface ChestDef {
  id: string;
  afterLevel: number;
  coins: number;
  gems: number;
  label: string;
}

/** Сундук появляется после каждого босса; чем дальше — тем жирнее. */
export function chestForBossLevel(bossLevel: number): ChestDef {
  return {
    id: `chest_${bossLevel}`,
    afterLevel: bossLevel,
    coins: 150 + bossLevel * 15,
    gems: 2 + Math.floor(bossLevel / 24) * 2,
    label: `Сундук ступени ${bossLevel}`,
  };
}
