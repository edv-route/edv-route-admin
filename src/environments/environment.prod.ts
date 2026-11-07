/**
 * Production config. Swapped in for environment.ts at build time via the
 * `production` fileReplacements in angular.json.
 *
 * apiUrl MUST point at the backend's public Railway URL (with the /api/v1
 * prefix). Update it after the backend service is deployed and its domain
 * is known, then push so Railway rebuilds the frontend.
 *
 * Moved to a third, paid Railway account on 2026-11-07. The original name was
 * freed on the expired account and reclaimed here, so the `-production` suffix
 * of the 2026-08-26 account is gone.
 */
export const environment = {
  apiUrl: 'https://edv-route-backend.up.railway.app/api/v1',
  /** Step-unlock is a development-only aid; never enabled in production. */
  unlockSteps: false,
};
