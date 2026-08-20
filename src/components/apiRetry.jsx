// Lightweight retry helper for API calls that might fail due to
// transient issues (network blips, backend still catching up) rather
// than a real, permanent error (bad request, permission denied, etc).

// Only retry on things that are plausibly transient. A 400/401/403/404
// isn't going to fix itself by trying again — a network drop or a
// 5xx from an overloaded backend might.
function isRetryable(error) {
  if (!error.response) return true; // network error / timeout / CORS block
  return error.response.status >= 500;
}

/**
 * Runs apiCall (a function returning a Promise), retrying on transient
 * failures with a short increasing delay between attempts.
 *
 * @param {() => Promise} apiCall
 * @param {{ retries?: number, delayMs?: number }} options
 */
export async function withRetry(apiCall, { retries = 3, delayMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await apiCall();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !isRetryable(err)) {
        break;
      }

      // Wait a bit longer each time: 1s, 2s, 3s...
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}