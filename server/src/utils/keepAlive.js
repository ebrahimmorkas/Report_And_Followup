/*
 * KEEP-ALIVE (RENDER FREE PLAN)
 *
 * Render's free plan stops the server after 15 minutes without an incoming request,
 * and waking it takes about a minute - longer than Vercel waits, so the first visitor
 * after a quiet spell gets an error.
 *
 * This calls the server's own public /api/health every 10 minutes so it never counts
 * as idle. It only runs on Render (RENDER_EXTERNAL_URL is set by Render itself), so local
 * development is untouched. Set KEEP_ALIVE_ENABLED=0 to turn it off, e.g. on a paid plan
 * that never sleeps.
 *
 * Deliberately never throws: a failed ping is only logged and the next one is tried.
 */

const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
const KEEP_ALIVE_TIMEOUT_MS = 30 * 1000;

let keepAliveTimer = null;

async function pingSelf(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(KEEP_ALIVE_TIMEOUT_MS) });
    if (!response.ok) console.warn(`! Keep-alive ping answered with status ${response.status}`);
  } catch (err) {
    console.warn('! Keep-alive ping failed:', err.message);
  }
}

export function startKeepAlive() {
  try {
    const baseUrl = (process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl || process.env.KEEP_ALIVE_ENABLED == 0 || keepAliveTimer) return false;

    const url = `${baseUrl}/api/health`;
    keepAliveTimer = setInterval(() => pingSelf(url), KEEP_ALIVE_INTERVAL_MS);
    // Never the reason the process stays up.
    keepAliveTimer.unref();

    console.log(`✓ Keep-alive started: ${url} every 10 minutes`);
    return true;
  } catch (err) {
    console.warn('! Keep-alive could not be started:', err.message);
    return false;
  }
}
