import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from './game/config';

/**
 * React-обёртка: монтирует Phaser-игру на весь экран.
 * Весь геймплей и UI живут внутри Phaser (сцены), React — только хост.
 */
export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const game = new Phaser.Game({ ...createGameConfig(), parent: hostRef.current });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050f0a] select-none">
      <div className="jungle-bg absolute inset-0" aria-hidden />

      {/* Боковые руны — видны только на широких экранах */}
      <div className="side-runes font-display pointer-events-none absolute left-4 top-1/2 hidden -translate-y-1/2 text-sm text-[#f5b52e]/30 lg:block">
        ЛЕСТНИЦА · БОГА · ТРИ В РЯД
      </div>
      <div className="side-runes font-display pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-sm text-[#2ee6a8]/25 lg:block">
        VK MINI APPS · PHASER 3 · MATCH-3
      </div>

      <div ref={hostRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
    </div>
  );
}
