export interface DashboardSummary {
  drivers: {
    approved: number;
    pending: number;
    suspended: number;
    /** Drivers on administrative leave (paused): frozen tariff, not operating. */
    paused: number;
    /** driver.approved events in the last 7 days vs the 7 before (audit log). */
    approvedLast7: number;
    approvedPrev7: number;
  };
  subscriptions: { dueSoon: number; expired: number; reminderDays: number };
  documents: { dueSoon: number; expired: number; warningDays: number };
  /** Decimal string, API money convention. */
  invoicing: { last7DaysUsd: string; last7DaysCount: number; prev7DaysUsd: string };
}

/** Week-over-week movement for a stat card (Pro trend pattern). */
export interface StatTrend {
  direction: 'up' | 'down' | 'flat';
  label: string;
}
