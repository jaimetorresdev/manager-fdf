import { describe, it, expect } from 'vitest';
import { corsOriginResolver } from './env';

function allows(resolver: ReturnType<typeof corsOriginResolver>, origin: string | undefined): boolean {
  let result = false;
  resolver(origin, (_err, allow) => { result = allow; });
  return result;
}

describe('corsOriginResolver (AUDIT 5.9-7 — CORS endurecido)', () => {
  const allowlist = ['https://managerfdf.com'];

  it('permite los orígenes de la allowlist en prod', () => {
    const r = corsOriginResolver(allowlist, false);
    expect(allows(r, 'https://managerfdf.com')).toBe(true);
  });

  it('en prod RECHAZA localhost y orígenes arbitrarios', () => {
    const r = corsOriginResolver(allowlist, false);
    expect(allows(r, 'http://localhost:5173')).toBe(false);
    expect(allows(r, 'https://evil.example')).toBe(false);
  });

  it('en dev permite localhost/127.0.0.1/[::1] en cualquier puerto', () => {
    const r = corsOriginResolver(allowlist, true);
    expect(allows(r, 'http://localhost:5173')).toBe(true);
    expect(allows(r, 'http://127.0.0.1:3000')).toBe(true);
    expect(allows(r, 'http://[::1]:8080')).toBe(true);
  });

  it('en dev sigue RECHAZANDO orígenes externos (no es origin:true)', () => {
    const r = corsOriginResolver(allowlist, true);
    expect(allows(r, 'https://evil.example')).toBe(false);
    expect(allows(r, 'http://localhost.evil.com')).toBe(false);
  });

  it('permite peticiones sin Origin (curl/native)', () => {
    expect(allows(corsOriginResolver(allowlist, false), undefined)).toBe(true);
  });
});
