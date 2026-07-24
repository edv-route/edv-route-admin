/** value is JSON: number for windows/hours, string for the timezone. */
export interface Setting {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

/** Human labels; unknown keys fall back to the raw key. */
export const SETTING_LABELS: Record<string, string> = {
  business_timezone: 'Zona horaria del negocio',
  payment_reminder_days: 'Aviso de pago próximo (días)',
  subscription_grace_hours: 'Gracia tras vencer la tarifa (horas)',
};
