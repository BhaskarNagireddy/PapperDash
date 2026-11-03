import { describe, expect, it } from 'vitest';
import { api, ApiError, apiUrl } from './api';

const respond = (status: number, body?: unknown) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status });

describe('api', () => {
  it('calls /v1 on the same origin from the browser, and core directly from the server', () => {
    expect(apiUrl('/pricing', false)).toBe('/v1/pricing');
    expect(apiUrl('pricing', true)).toBe('http://localhost:4000/v1/pricing');
  });

  it('returns the JSON body on success', async () => {
    await expect(api('/pricing', {}, respond(200, { currency: 'SEK' }))).resolves.toEqual({ currency: 'SEK' });
  });

  it("throws the server's code and message, so the customer sees what to do next", async () => {
    const err = await api('/auth/login', { method: 'POST', body: '{}' }, respond(429, { error: 'too_many_attempts', message: 'Too many failed attempts.', retryAfterSec: 600 })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'too_many_attempts', message: 'Too many failed attempts.', retryAfterSec: 600 });
  });

  it('joins validation messages and falls back to a plain message when the body is not JSON', async () => {
    await expect(api('/x', {}, respond(400, { error: 'validation', message: ['Email is invalid.', 'Password is too short.'] }))).rejects.toMatchObject({
      message: 'Email is invalid. Password is too short.',
    });
    await expect(api('/x', {}, async () => new Response('<html>', { status: 502 }))).rejects.toMatchObject({ code: 'http_502' });
  });

  it('reports a lost connection as such, not as a server error', async () => {
    await expect(
      api('/x', {}, async () => {
        throw new TypeError('fetch failed');
      }),
    ).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('handles 204 No Content', async () => {
    await expect(api('/auth/logout', { method: 'POST' }, respond(204))).resolves.toBeUndefined();
  });
});
