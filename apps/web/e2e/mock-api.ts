import type { Page, Request, Route } from '@playwright/test';

type Reply = { status: number; body?: unknown };
type Handler = (req: Request) => Reply | Promise<Reply>;

/**
 * Stands in for the core API in the browser, so each screen can be shown in every state (errors, limits,
 * expired links, no network) quickly and deterministically. The real API is covered by core's own tests and
 * by e2e/fullstack.spec.ts. Defaults: nobody is signed in and ordering is closed.
 */
export async function mockApi(page: Page, handlers: Record<string, Handler> = {}) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const all: Record<string, Handler> = {
    'GET /v1/auth/me': () => ({ status: 401, body: { error: 'not_signed_in', message: 'Sign in to continue.' } }),
    'GET /v1/status': () => ({ status: 200, body: { ordering: false } }),
    ...handlers,
  };
  await page.route('**/v1/**', async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const key = `${req.method()} ${path}`;
    calls.push({ method: req.method(), path, body: req.postDataJSON() as unknown });
    const handler = all[key];
    if (!handler) return route.fulfill({ status: 500, json: { error: 'unmocked', message: `No mock for ${key}` } });
    const reply = await handler(req);
    if (reply.status === 204) return route.fulfill({ status: 204 });
    return route.fulfill({ status: reply.status, json: reply.body ?? {} });
  });
  return { calls, sent: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key) };
}

export const user = (overrides: Record<string, unknown> = {}) => ({
  id: 'usr_1',
  email: 'anna@example.se',
  roles: ['customer'],
  locale: 'sv',
  emailVerified: true,
  ...overrides,
});
