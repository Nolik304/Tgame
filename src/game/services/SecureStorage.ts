// ============================================================
// Защита сейва: обфускация (XOR + base64) + контрольная подпись.
// Подмена любого поля ломает подпись — сейв сбрасывается.
// Это «защита от ленивых» (ключ в клиенте); полная защита —
// серверная (см. server/vk-cloud-function.js).
// ============================================================

const SECRET = 'stairway-of-gods::v1::do-not-touch';

function hash(str: string): string {
  let h1 = 0xdeadbeef | 0;
  let h2 = 0x41c6ce57 | 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

function xorB64(plain: string): string {
  let out = '';
  for (let i = 0; i < plain.length; i++) {
    out += String.fromCharCode(plain.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length));
  }
  return btoa(unescape(encodeURIComponent(out)));
}

function unxorB64(encoded: string): string {
  const raw = decodeURIComponent(escape(atob(encoded)));
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    out += String.fromCharCode(raw.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length));
  }
  return out;
}

export const SecureStorage = {
  /** Упаковать объект в защищённую строку. */
  seal(data: unknown): string {
    const json = JSON.stringify(data);
    return JSON.stringify({ d: xorB64(json), s: hash(json + SECRET) });
  },

  /** Распаковать; null — если данные битые или подделанные. */
  unseal<T>(raw: string): T | null {
    try {
      const parsed = JSON.parse(raw) as { d?: string; s?: string };
      if (typeof parsed.d === 'string' && typeof parsed.s === 'string') {
        const json = unxorB64(parsed.d);
        if (hash(json + SECRET) !== parsed.s) return null; // подделка
        return JSON.parse(json) as T;
      }
      // обратная совместимость: старый чистый JSON-сейв
      return parsed as T;
    } catch {
      return null;
    }
  },
};
