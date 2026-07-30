/** Environment config. Adjust apiUrl per deployment target when shipping. */
export const environment = {
  apiUrl: 'http://localhost:3000/api/v1',
  /**
   * DEV ONLY: lets the wizard jump to any step without completing step 1, to
   * ease visual review. MUST stay false in production (see environment.prod.ts).
   */
  unlockSteps: true,
};
