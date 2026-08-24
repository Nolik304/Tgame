// ============================================================
// Базовый класс интеграции с VK Bridge.
// Внутри ВК использует реальные методы vk-bridge, снаружи —
// безопасные мок-фолбэки, чтобы игра работала в любом браузере.
// Монетизация — только rewarded-реклама (без платежей VK Pay).
// ============================================================
import vkBridge from '@vkontakte/vk-bridge';

export interface VKProfile {
  id: number;
  firstName: string;
  lastName: string;
  photo: string;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class VKBridgeService {
  inVK = false;
  private ready = false;

  /** Определяет, запущены ли мы внутри клиента ВКонтакте. */
  private detect(): boolean {
    const w = window as unknown as { vkBridge?: unknown };
    this.inVK =
      !!w.vkBridge ||
      /vkclient|vk\/|ok_client/i.test(navigator.userAgent) ||
      location.hostname.includes('vk.com') ||
      location.hostname.includes('vk-apps');
    return this.inVK;
  }

  /** VKWebAppInit — обязателен перед любыми вызовами bridge. */
  async init(): Promise<boolean> {
    if (!this.detect()) return false;
    try {
      await vkBridge.send('VKWebAppInit');
      this.ready = true;
    } catch {
      this.ready = false;
    }
    return this.ready;
  }

  /** Профиль игрока (аватар, имя). Вне ВК — мок «Искатель Богов». */
  async getUserProfile(): Promise<VKProfile> {
    if (this.inVK && this.ready) {
      try {
        const u = await vkBridge.send('VKWebAppGetUserInfo');
        return { id: u.id, firstName: u.first_name, lastName: u.last_name, photo: u.photo_100 };
      } catch {
        /* фолбэк ниже */
      }
    }
    await delay(200);
    return { id: 0, firstName: 'Искатель', lastName: 'Богов', photo: '' };
  }

  /** Rewarded-реклама. Возвращает true, если награду можно выдать. */
  async showRewardedAd(): Promise<boolean> {
    if (this.inVK && this.ready) {
      try {
        const check = (await vkBridge.send('VKWebAppCheckNativeAds', {
          ad_format: 'reward',
        })) as unknown as { result?: boolean };
        if (!check.result) return false;
        const res = (await vkBridge.send('VKWebAppShowNativeAds', {
          ad_format: 'reward',
        })) as unknown as { result?: boolean; reward?: boolean };
        return !!res.reward || !!res.result;
      } catch {
        return false;
      }
    }
    // Мок: имитируем показ ролика
    await delay(1100);
    return true;
  }

  /** Облачное сохранение (внутри ВК), снаружи — только localStorage. */
  async saveCloud(key: string, value: unknown): Promise<void> {
    if (!this.inVK || !this.ready) return;
    try {
      await vkBridge.send('VKWebAppStorageSet', { key, value: JSON.stringify(value) });
    } catch {
      /* игнор: локальный сейв уже записан */
    }
  }

  /** Вибрация: Taptic API ВК либо navigator.vibrate. */
  taptic(style: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (this.inVK && this.ready) {
      vkBridge.send('VKWebAppTapticImpactOccurred', { style }).catch(() => undefined);
      return;
    }
    try {
      navigator.vibrate?.(style === 'heavy' ? 40 : 18);
    } catch {
      /* не поддерживается */
    }
  }
}

export const vk = new VKBridgeService();
