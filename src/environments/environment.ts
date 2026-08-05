/** Environment config. Adjust apiUrl per deployment target when shipping. */
export const environment = {
  apiUrl: 'http://localhost:3000/api/v1',
  /**
   * DEV ONLY escape hatch: when true, the wizard lets you jump to any step
   * without completing step 1 (handy for reviewing steps 2-4 in isolation).
   * Kept false so dev mirrors the production step-1 gate; flip to true only for
   * a throwaway visual review. MUST stay false in production (see environment.prod.ts).
   */
  unlockSteps: false,
};
