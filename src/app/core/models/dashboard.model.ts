export interface DashboardSummary {
  drivers: { approved: number; pending: number; suspended: number };
  subscriptions: { dueSoon: number; expired: number; reminderDays: number };
  /** Decimal string, API money convention. */
  invoicing: { last7DaysUsd: string; last7DaysCount: number };
}
