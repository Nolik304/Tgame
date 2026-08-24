// ============================================================
// Безопасное key-value хранилище. Внутри VK WebView (особенно
// на iOS) localStorage может быть заблокирован — тогда игра
// автоматически переключается на память вместо падения.
// ============================================================

const memory = new Map<string, string>();
let usable: boolean | null = null;

function check(): boolean {
  if (usable !== null) return usable;
  try {
    const k = '__safe_kv_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    usable = true;
  } catch {
    usable = false;
  }
  return usable;
}

export const SafeKV = {
  get(key: string): string | null {
    if (!check()) return memory.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    if (!check()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      usable = false;
    }
  },
  remove(key: string): void {
    memory.delete(key);
    if (!check()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
