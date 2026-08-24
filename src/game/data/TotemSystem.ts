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
// активируется сам («срабатывает от нашего шанса»).
//
// ПРОКАЧКА — две шкалы по 10 уровней (как крит-шанс в спеке):
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

/** Шанс крита при срабатывании тотема — эффект усиливается вдвое. */
export const PROC_CRIT_CHANCE = 12;

// ---------- Сохранение ----------

export interface TotemSave {
  proc: number; // 0..10 — уровни ШАНСА
  power: number; // 0..10 — уровни СИЛЫ
}

export const TOTEM_SAVE_DEFAULT = (): Record<TotemId, TotemSave> => ({
  red: { proc: 0, power: 0 },
  green: { proc: 0, power: 0 },
  blue: { proc: 0, power: 0 },
});

// ---------- Расчёт характеристик ----------

export function totemProc(s: TotemSave): number {
  return s.proc > 0 ? PROC_TABLE[Math.min(s.proc, 10) - 1] : 0;
}

export function totemStats(id: TotemId, s: TotemSave): {
  proc: number;
  radius: number;
  extraBall: number;
  moves: number;
  chain: number;
} {
  const p = Math.min(10, Math.max(0, s.power));
  return {
    proc: totemProc(s),
    // красный: радиус 3×3 → 4×4 (сила 5) → 5×5 (сила 10); шанс 2-го снаряда
    radius: 3 + (p >= 5 ? 1 : 0) + (p >= 10 ? 1 : 0),
    extraBall: p * 3, // 0..30%
    // зелёный: доп. ходы 2 → 5
    moves: 2 + Math.floor(p / 3),
    // синий: длина цепи 3 → 8
    chain: 3 + Math.floor(p / 2),
  };
}
