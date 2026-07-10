export interface Membership {
  id: number;
  name: string;
  description: string | null;
  priceUsd: string;
  active: boolean;
  benefitIds: number[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BillingPeriod = 'daily' | 'weekly' | 'monthly' | 'annual';

export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string | null;
  billingPeriod: BillingPeriod;
  priceUsd: string;
  allowedVehicleTypes: number[] | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  annual: 'Anual',
};
