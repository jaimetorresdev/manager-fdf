import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
});

vi.stubGlobal('caches', {
  delete: vi.fn(async () => true),
});

describe('api client request()', () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    });
    vi.stubGlobal('caches', { delete: vi.fn(async () => true) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadClient() {
    return import('../../src/api/client');
  }

  it('lanza TimeoutError cuando el fetch supera el timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })));

    const { request, TimeoutError, DEFAULT_REQUEST_TIMEOUT_MS } = await loadClient();
    const promise = request('/slow', { timeoutMs: 20 });
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('limpia token y emite fdf_unauthorized en 401', async () => {
    storage.set('fdf_token', 'expired');
    const unauthorized = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: unauthorized });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'Token inválido' }),
      text: async () => JSON.stringify({ error: 'Token inválido' }),
    })));

    const { request, ApiError } = await loadClient();
    await expect(request('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(storage.get('fdf_token')).toBeUndefined();
    expect(unauthorized).toHaveBeenCalled();
  });

  it('persiste token rotado tras updateMe', async () => {
    storage.set('fdf_token', 'old-token');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer old-token');
      if (url.endsWith('/auth/me') && init?.method === 'PATCH') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ token: 'new-token', id: 1, email: 'a@b.c' }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}), text: async () => '' };
    }));

    const { authApi } = await loadClient();
    const res = await authApi.updateMe({ email: 'a@b.c' });
    expect(res.token).toBe('new-token');
    expect(storage.get('fdf_token')).toBe('new-token');
  });

  it('no permite sobrescribir Authorization desde headers externos', async () => {
    storage.set('fdf_token', 'real-token');
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer real-token');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      };
    }));

    const { request } = await loadClient();
    await request('/club', { headers: { Authorization: 'Bearer evil' } });
  });

  it('distingue cancelación manual de timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })));

    const { request, RequestAbortedError, TimeoutError } = await loadClient();
    const controller = new AbortController();
    const promise = request('/x', { signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(RequestAbortedError);
    await expect(request('/y', { timeoutMs: 15 })).rejects.toBeInstanceOf(TimeoutError);
  });
});
