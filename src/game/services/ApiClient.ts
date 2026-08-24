// ============================================================
// Слой связи с сервером. Пока API_URL пустой — игра работает
// полностью локально (localStorage + VK Cloud Storage). Когда
// поднимешь сервер (см. server/vk-cloud-function.js), впиши его
// URL сюда — и прогресс начнёт синхронизироваться/проверяться.
// ============================================================

const API_URL = ''; // например: 'https://<твоя-функция>.vk-apps.com'
const TIMEOUT = 4000;

async function post(path: string, body: unknown): Promise<void> {
  if (!API_URL) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    /* сеть недоступна — локальный сейв уже записан */
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  /** Отправить прогресс на сервер (fire-and-forget). */
  pushProgress(vkId: number, data: unknown): void {
    if (!API_URL || !vkId) return;
    void post('/progress', { vkId, data, ts: Date.now() });
  },
};
