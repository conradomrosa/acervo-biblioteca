import type { Env } from './types';

export const ACCOUNT_WINDOW = 15 * 60 * 1000;
export const ACCOUNT_LIMIT = 5;
export const ACCOUNT_BLOCK = 30 * 1000;

const accountScope = (username: string) => `account:${username.trim().toLocaleLowerCase('en-US').slice(0, 256)}`;

export async function loginBlocked(env: Env, username: string, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_rate_limits WHERE last_attempt_at<?').bind(now - 24 * 60 * 60 * 1000),
    env.DB.prepare("DELETE FROM login_rate_limits WHERE scope='global'"),
  ]);
  const row = await env.DB.prepare('SELECT blocked_until FROM login_rate_limits WHERE scope=?').bind(accountScope(username)).first<{ blocked_until: number | null }>();
  return row?.blocked_until !== null && row?.blocked_until !== undefined && row.blocked_until > now;
}

export async function recordLoginFailure(env: Env, username: string, now = Date.now()) {
  const scope = accountScope(username);
  const sql = `INSERT INTO login_rate_limits(scope,failures,window_started_at,blocked_until,last_attempt_at)
    VALUES(?,1,?,?,?)
    ON CONFLICT(scope) DO UPDATE SET
      failures=CASE WHEN ? - window_started_at >= ? THEN 1 ELSE failures + 1 END,
      window_started_at=CASE WHEN ? - window_started_at >= ? THEN ? ELSE window_started_at END,
      blocked_until=CASE
        WHEN ? - window_started_at >= ? THEN NULL
        WHEN failures + 1 >= ? THEN ? + MIN(900000, ? * (1 << MIN(failures + 1 - ?, 8)))
        ELSE blocked_until
      END,
      last_attempt_at=?`;
  await env.DB.prepare(sql).bind(
    scope, now, null, now,
    now, ACCOUNT_WINDOW,
    now, ACCOUNT_WINDOW, now,
    now, ACCOUNT_WINDOW,
    ACCOUNT_LIMIT, now, ACCOUNT_BLOCK, ACCOUNT_LIMIT,
    now,
  ).run();
}

export async function clearLoginLimit(env: Env, username: string) {
  await env.DB.prepare('DELETE FROM login_rate_limits WHERE scope=?').bind(accountScope(username)).run();
}
