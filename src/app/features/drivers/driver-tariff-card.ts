import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { DriverDetail } from '../../core/models/driver.model';

type BadgeTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger';
interface TariffBadge {
  label: string;
  tone: BadgeTone;
}

/** Human unit of a billing period ("$10 / semana"). */
const PERIOD_UNIT: Record<string, string> = {
  daily: 'día',
  weekly: 'semana',
  monthly: 'mes',
  annual: 'año',
};

/**
 * Tariff card of the affiliate profile: the plan + a descriptive status badge,
 * its price per period, and the dynamic coverage detail (paid-through date, paid
 * periods, next charge / start, scheduled plan change). Presentational — it only
 * emits `cancelChange`; the parent owns the confirm modal. Extracted from
 * `driver-detail` (2026-08-06) alongside the status card.
 */
@Component({
  selector: 'app-driver-tariff-card',
  // display:contents so the inner card is the direct grid item and stretches to
  // the row height, matching the sibling cards (Membresía / Estado).
  host: { class: 'contents' },
  imports: [DatePipe],
  templateUrl: './driver-tariff-card.html',
})
export class DriverTariffCard {
  readonly driver = input.required<DriverDetail>();
  /** Cancel the scheduled plan change (the parent opens the confirm modal). */
  readonly cancelChange = output<void>();

  readonly toneClasses: Record<BadgeTone, string> = {
    accent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    warning: 'bg-gold-200 text-gold-800',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };

  /** Whole days until the paid coverage ends; negative = overdue, null when none. */
  coverDays(): number | null {
    const until = this.driver().subscription?.paidUntil;
    if (!until) return null;
    return Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000);
  }

  /** Start of a paid-but-not-in-force tariff (bought week starts a future Monday). */
  readonly startsAt = computed<string | null>(() => {
    const s = this.driver().subscription;
    if (!s || s.status !== 'scheduled' || !s.currentPeriodStart) return null;
    return new Date(s.currentPeriodStart).getTime() > Date.now() ? s.currentPeriodStart : null;
  });

  /** Human unit of the plan's billing period ("semana", "mes"…). */
  periodUnit(): string {
    return PERIOD_UNIT[this.driver().subscription?.billingPeriod ?? ''] ?? 'período';
  }

  /** Descriptive status badge, reading the driver status first, then the coverage. */
  readonly badge = computed<TariffBadge | null>(() => {
    const d = this.driver();
    const s = d.subscription;
    if (!s) return null;
    if (d.status === 'paused') return { label: 'Congelada', tone: 'neutral' };
    if (d.status === 'pending') {
      if (d.pendingSubmission) return { label: 'Pago en revisión', tone: 'accent' };
      if (Number(d.debt.totalUsd) > 0) return { label: 'Sin pagar', tone: 'warning' };
      return { label: 'Por activar', tone: 'accent' };
    }
    const cover = this.coverDays();
    if (s.status === 'expired' || (cover !== null && cover < 0)) return { label: 'Vencida', tone: 'danger' };
    if (s.status === 'active' && cover !== null && cover <= 2) return { label: 'Por vencer', tone: 'warning' };
    if (s.status === 'active') return { label: 'Vigente', tone: 'success' };
    if (s.status === 'scheduled') return { label: 'Programada', tone: 'neutral' };
    return { label: 'Pago pendiente', tone: 'warning' };
  });
}
