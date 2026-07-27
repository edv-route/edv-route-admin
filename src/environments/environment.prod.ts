/**
 * Production config. Swapped in for environment.ts at build time via the
 * `production` fileReplacements in angular.json.
 *
 * apiUrl MUST point at the backend's public Railway URL (with the /api/v1
 * prefix). Update it after the backend service is deployed and its domain
 * is known, then push so Railway rebuilds the frontend.
 */
export const environment = {
  apiUrl: 'https://edv-route-backend.up.railway.app/api/v1',
};
