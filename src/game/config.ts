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
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_W,
      height: GAME_H,
    },
    scene: [BootScene, MapScene, UIScene, GameScene],
    // мягкая физика не нужна — всё на твинах
    fps: { target: 60, forceSetTimeOut: false },
  };
}
