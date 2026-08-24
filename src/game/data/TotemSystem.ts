// ============================================================
// СИСТЕМА ТОТЕМОВ (адаптация боевых навыков под прокачку)
//
// 3 ТОТЕМА:
//  - КРАСНЫЙ (Пламя)  — взрыв по области, цель выбирается пальцем;
//  - ЗЕЛЁНЫЙ (Дар)    — дополнительные ходы, срабатывает мгновенно;
//  - СИНИЙ  (Гроза)   — цепная молния по ближайшим фишкам +
//                       пассивный шанс «заряженных» фишек.
//
// ПРОКАЧКА: 10 уровней крита + 3 особых улучшения на тотем.
// Стоимость каждой ступени: 10 гемов (шанс 10%) ИЛИ 1500 монет (шанс 7%).
// При неудаче ресурсы сгорают, уровень не растёт (по спеке).
// ============================================================
import type { FruitKind } from './gameData';

export type TotemId = 'red' | 'green' | 'blue';

export interface TotemDef {
  id: TotemId;
  name: string;
  /** каким кристаллом заряжается; null — заряд идёт с любых матчей */
  kind: FruitKind | null;
  charge: number;
  effect: 'blast' | 'moves' | 'chain';
  desc: string;
  icon: string;
  color: number;
}

export const TOTEMS: TotemDef[] = [
  {
    id: 'red',
    name: 'ПЛАМЯ БОГОВ',
    kind: '0',
    charge: 12,
    effect: 'blast',
    desc: 'Взрыв 3×3 по выбранной клетке',
    icon: 'skill_red',
    color: 0xff5a4a,
  },
  {
    id: 'green',
    name: 'ДАР СТУПЕНЕЙ',
    kind: null,
    charge: 12,
    effect: 'moves',
    desc: 'Дополнительные ходы (+2, крит — больше)',
    icon: 'skill_green',
    color: 0x4ae07a,
  },
  {
    id: 'blue',
    name: 'ЦЕПНАЯ ГРОЗА',
    kind: '3',
    charge: 12,
    effect: 'chain',
    desc: 'Молния бьёт цепью по 3 ближайшим фишкам',
    icon: 'skill_blue',
    color: 0x4aa8ff,
  },
];

// ---------- Таблицы прокачки (по спеке) ----------

/** Шанс крита на уровнях 1..10 (+1.5% за уровни 1–5, +3% за 6–10). */
export const CRIT_TABLE = [1.5, 3.0, 4.5, 6.0, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5];

export const UPGRADE_COST = { gems: 10, coins: 1500 };
export const UPGRADE_RATE: Record<'gems' | 'coins', number> = { gems: 0.1, coins: 0.07 };

export interface BonusUpgradeDef {
  id: string;
  name: string;
  desc: string;
}

export const BONUS_UPGRADES: Record<TotemId, BonusUpgradeDef[]> = {
  red: [
    { id: 'ball2', name: 'Двойной снаряд I', desc: '10% шанс второго взрыва' },
    { id: 'ball3', name: 'Двойной снаряд II', desc: '20% шанс второго взрыва' },
    { id: 'radius4', name: 'Широкий взрыв', desc: 'Область 4×4 вместо 3×3' },
  ],
  green: [
    { id: 'moves3', name: 'Щедрость I', desc: '+3 хода вместо +2' },
    { id: 'moves5', name: 'Щедрость II', desc: '+5 ходов вместо +2' },
    { id: 'fast', name: 'Быстрый дар', desc: 'Заряд в 2 раза быстрее' },
  ],
  blue: [
    { id: 'chain4', name: 'Длинная цепь I', desc: 'Цепь 4 фишки вместо 3' },
    { id: 'charge25', name: 'Заряд фишек I', desc: '25% шанс заряженной фишки' },
    { id: 'charge35', name: 'Заряд фишек II', desc: '35% шанс заряженной фишки' },
  ],
};

// ---------- Сохранение ----------

export interface TotemSave {
  level: number; // 0..10 — уровни крита
  unlocked: string[]; // id купленных бонус-улучшений
}

export const TOTEM_SAVE_DEFAULT = (): Record<TotemId, TotemSave> => ({
  red: { level: 0, unlocked: [] },
  green: { level: 0, unlocked: [] },
  blue: { level: 0, unlocked: [] },
});

// ---------- Расчёт характеристик ----------

export function totemCrit(s: TotemSave): number {
  return s.level > 0 ? CRIT_TABLE[Math.min(s.level, 10) - 1] : 0;
}

export function totemStats(id: TotemId, s: TotemSave): {
  crit: number;
  radius: number;
  extraBall: number;
  moves: number;
  chain: number;
  chargedChance: number;
} {
  const has = (u: string) => s.unlocked.includes(u);
  return {
    crit: totemCrit(s),
    radius: has('radius4') ? 4 : 3,
    extraBall: has('ball3') ? 20 : has('ball2') ? 10 : 0,
    moves: has('moves5') ? 5 : has('moves3') ? 3 : 2,
    chain: has('chain4') ? 4 : 3,
    chargedChance: has('charge35') ? 35 : has('charge25') ? 25 : 15,
  };
}
