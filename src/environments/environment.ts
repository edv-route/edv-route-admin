/** Environment config. Adjust apiUrl per deployment target when shipping. */
export const environment = {
  // ⚠️ TEMPORAL (2026-08-13): apuntado al backend de INTERNET (Railway) para
  // probar sin levantar el backend local. Motivo: prod y dev comparten la MISMA
  // base de datos, y correr DOS backends a la vez (Railway + local) agota su tope
  // de conexiones (pool 15) → errores "max clients reached" y pantallas en blanco.
  // Para volver a desarrollar contra el backend local, restaurar:
  //   apiUrl: 'http://localhost:3000/api/v1',
  apiUrl: 'https://edv-route-backend.up.railway.app/api/v1',
  /**
   * DEV ONLY escape hatch: when true, the wizard lets you jump to any step
   * without completing step 1 (handy for reviewing steps 2-4 in isolation).
   * Kept false so dev mirrors the production step-1 gate; flip to true only for
   * a throwaway visual review. MUST stay false in production (see environment.prod.ts).
   */
  unlockSteps: false,
};
