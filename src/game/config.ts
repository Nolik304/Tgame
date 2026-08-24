// ============================================================
// Конфигурация Phaser 3.
// Порядок сцен: Boot → Map + UI (параллельно, UI поверх карты)
// → Game. Масштаб FIT: mobile-first, вертикальная ориентация.
// ============================================================
import Phaser from 'phaser';
import { GAME_W, GAME_H } from './data/gameData';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { UIScene } from './scenes/UIScene';
import { GameScene } from './scenes/GameScene';

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    backgroundColor: '#081a10',
    width: GAME_W,
    height: GAME_H,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MapScene, UIScene, GameScene],
    // Звук — собственный WebAudio-синтезатор (SoundManager)
    audio: { noAudio: true },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    fps: { target: 60 },
  };
}
