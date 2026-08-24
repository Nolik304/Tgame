// ============================================================
// СИСТЕМА ТОТЕМОВ — ПАССИВНАЯ (по спеке пользователя)
//
// 3 ТОТЕМА:
//  - КРАСНЫЙ «Пламя Богов» — взрыв области на поле;
//  - ЗЕЛЁНЫЙ «Дар Ступеней» — дополнительные ходы;
//  - СИНИЙ  «Цепная Гроза» — молния по цепи фишек.
//
// Тотемы НЕ нажимаются вручную: каждый срабатывает ПАССИВНО —
// после каждого матча бросается шанс, и при успехе эффект
// активируется сам.
//
// ПРОКАЧКА — две шкалы по 10 уровней:
//  - ШАНС  (proc)  — вероятность пассивного срабатывания за матч;
//  - СИЛА  (power) — мощность эффекта (радиус/цепь/ходы).
// Стоимость ступени: 10 гемов (шанс 10%) ИЛИ 1500 монет (шанс 7%).
// При неудаче ресурсы сгорают, уровень не растёт.
// ============================================================

export type TotemId = 'red' | 'green' | 'blue';

export interface TotemDef {
  id: TotemId;
  name: string;
  desc: string;
  icon: string;
  color: number;
}

export const TOTEMS: TotemDef[] = [
  {
    id: 'red',
    name: 'ПЛАМЯ БОГОВ',
    desc: 'Пассивно взрывает область поля при матче',
    icon: 'skill_red',
    color: 0xff5a4a,
  },
  {
    id: 'green',
    name: 'ДАР СТУПЕНЕЙ',
    desc: 'Пассивно добавляет ходы при матче',
    icon: 'skill_green',
    color: 0x4ae07a,
  },
  {
    id: 'blue',
    name: 'ЦЕПНАЯ ГРОЗА',
    desc: 'Пассивно бьёт молнией по цепи фишек',
    icon: 'skill_blue',
    color: 0x4aa8ff,
  },
];

// ---------- Шанс пассивного срабатывания (уровни 1..10, %) ----------
// Таблица из спеки: +1.5% за уровни 1–5, +3% за 6–10.
export const PROC_TABLE = [1.5, 3.0, 4.5, 6.0, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5];

export const UPGRADE_COST = { gems: 10, coins: 1500 };
export const UPGRADE_RATE: Record<'gems' | 'coins', number> = { gems: 0.1, coins: 0.07 };

/** Шанс крита при срабатывании тотема — эффект усиливается. */
export const PROC_CRIT_CHANCE = 12;

// ---------- Сохранение ----------

export interface TotemSave {
  proc: number; // уровень шкалы ШАНС (0..10)
  power: number; // уровень шкалы СИЛА (0..10)
}

export function TOTEM_SAVE_DEFAULT(): Record<TotemId, TotemSave> {
  return {
    red: { proc: 0, power: 0 },
    green: { proc: 0, power: 0 },
    blue: { proc: 0, power: 0 },
  };
}

// ---------- Итоговые характеристики ----------

export interface TotemStats {
  proc: number; // шанс срабатывания за матч, %
  radius: number; // red: сторона взрыва
  extraBall: number; // red: шанс второго снаряда, %
  moves: number; // green: сколько ходов даёт
  chain: number; // blue: длина цепи
}

export function totemStats(id: TotemId, save: TotemSave): TotemStats {
  const proc = save.proc > 0 ? PROC_TABLE[save.proc - 1] : 0;
  const p = save.power;
  switch (id) {
    case 'red':
      return {
        proc,
        radius: p >= 8 ? 5 : p >= 4 ? 4 : 3,
        extraBall: p >= 6 ? 30 : p >= 3 ? 15 : 0,
        moves: 0,
        chain: 0,
      };
    case 'green':
      return { proc, radius: 0, extraBall: 0, moves: 2 + Math.floor(p / 2), chain: 0 };
    case 'blue':
      return { proc, radius: 0, extraBall: 0, moves: 0, chain: 2 + p };
  }
}
