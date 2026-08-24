// ============================================================
// Реестр заменяемых спрайтов.
// Каждый элемент — слот: игра пытается загрузить PNG по пути
// `path`; если файла нет — рисует красивый procedural-фолбэк.
// Хочешь заменить картинку — просто положи PNG по этому пути
// (см. также SPRITES.md в корне проекта — там таблица для людей).
// ============================================================

export interface SpriteSlot {
  key: string; // ключ Phaser-текстуры (используется в коде)
  path: string; // откуда грузим PNG (относительно public/)
  ru: string; // что это такое
  size: string; // рекомендуемый размер в px
}

export const SPRITE_SLOTS: SpriteSlot[] = [
  // --- Кристаллы поля (5-6 видов) ---
  { key: 'fruit_0', path: 'fruits/0.png', ru: 'Кристалл «Рубин» (красный) — заряжает Огонь Богов', size: '96×96' },
  { key: 'fruit_1', path: 'fruits/1.png', ru: 'Кристалл «Сапфир» (синий)', size: '96×96' },
  { key: 'fruit_2', path: 'fruits/2.png', ru: 'Кристалл «Изумруд» (зелёный)', size: '96×96' },
  { key: 'fruit_3', path: 'fruits/3.png', ru: 'Кристалл «Топаз» (жёлтый) — заряжает Небесную Молнию', size: '96×96' },
  { key: 'fruit_4', path: 'fruits/4.png', ru: 'Кристалл «Аметист» (фиолетовый) — заряжает Дух Ветра', size: '96×96' },
  { key: 'fruit_5', path: 'fruits/5.png', ru: 'Кристалл «Обсидиан» (появляется с 201 уровня)', size: '96×96' },
  { key: 'fruitIcon', path: 'fruits/icon.png', ru: 'Иконка набора кристаллов (магазин, акции)', size: '48×48' },

  // --- Игровые объекты ---
  { key: 'vine', path: 'sprites/vine.png', ru: 'Лиана — блокирует клетку, рвётся от матча рядом', size: '64×64' },
  { key: 'slab', path: 'sprites/slab.png', ru: 'Каменная плита — 2 удара, трескается', size: '64×64' },
  { key: 'ice', path: 'sprites/ice.png', ru: 'Лёд — блокирует клетку, тает от матча рядом (эпоха II+)', size: '64×64' },
  { key: 'idol', path: 'sprites/idol.png', ru: 'Идол — цель «опусти вниз», падает сквозь поле', size: '96×96' },
  { key: 'bomb', path: 'sprites/bomb.png', ru: 'Солнечная бомба (бонус за остаток ходов)', size: '64×64' },

  // --- Мета-объекты ---
  { key: 'chest', path: 'sprites/chest.png', ru: 'Сундук с наградой на карте', size: '96×96' },
  { key: 'skull', path: 'sprites/skull.png', ru: 'Череп босса (полоса HP, логово)', size: '64×64' },
  { key: 'firebird', path: 'sprites/firebird.png', ru: 'Жар-птица — мини-ивент «Восхождение»', size: '96×96' },
  { key: 'gift', path: 'sprites/gift.png', ru: 'Подарок — ежедневный «Дар богов»', size: '48×48' },
  { key: 'coin', path: 'sprites/coin.png', ru: 'Монета', size: '48×48' },
  { key: 'gemIcon', path: 'sprites/gem.png', ru: 'Гем (премиум-валюта)', size: '48×48' },
  { key: 'heart', path: 'sprites/heart.png', ru: 'Жизнь (сердце)', size: '48×48' },

  // --- Иконки боевых навыков ---
  { key: 'skill_fire', path: 'sprites/skill_fire.png', ru: 'Навык «Огонь Богов»', size: '64×64' },
  { key: 'skill_bolt', path: 'sprites/skill_bolt.png', ru: 'Навык «Небесная Молния»', size: '64×64' },
  { key: 'skill_wind', path: 'sprites/skill_wind.png', ru: 'Навык «Дух Ветра»', size: '64×64' },

  // --- Карточки коллекции ---
  { key: 'card_feather', path: 'sprites/cards/feather.png', ru: 'Карта «Перо Кетцаля»', size: '48×48' },
  { key: 'card_mask', path: 'sprites/cards/mask.png', ru: 'Карта «Золотая маска»', size: '48×48' },
  { key: 'card_sun', path: 'sprites/cards/sun.png', ru: 'Карта «Солнечный диск»', size: '48×48' },
  { key: 'card_moon', path: 'sprites/cards/moon.png', ru: 'Карта «Лунный камень»', size: '48×48' },
  { key: 'card_idolcard', path: 'sprites/cards/idol.png', ru: 'Карта «Нефритовый идол»', size: '48×48' },
  { key: 'card_blade', path: 'sprites/cards/blade.png', ru: 'Карта «Обсидиановый клинок»', size: '48×48' },
  { key: 'card_snake', path: 'sprites/cards/snake.png', ru: 'Карта «Амулет змеи»', size: '48×48' },
  { key: 'card_eyecard', path: 'sprites/cards/eye.png', ru: 'Карта «Око бога»', size: '48×48' },
];
