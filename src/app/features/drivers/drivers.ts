import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DRIVER_STATUS_LABELS,
  type DriverListItem,
  type DriverStatus,
} from '../../core/models/driver.model';
import { DriversApi } from './drivers.api';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { Pagination } from '../../shared/components/pagination';

const PAGE_SIZE = 10;

/** Semantic tone of a tariff badge → its pill color classes. */
type BadgeTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger';

/** Descriptive tariff cell: a labelled badge + an explanatory line (with an
 *  optional date), derived from the driver status AND the subscription state so
 *  each scenario reads on its own — not a single cryptic "Programada" for all. */
interface TariffBadge {
  label: string;
  sub: string;
  /** ISO date appended to `sub` in the template (formatted there), or null. */
  date: string | null;
  tone: BadgeTone;
}

/** Descriptive driver-status cell: the status + a one-line definition, so
 *  "Pendiente" et al. explain what they mean and what the admin should do. */
interface StatusBadge {
  label: string;
  sub: string;
  /** Tailwind bg class for the status dot. */
  dot: string;
}

@Component({
  selector: 'app-drivers',
  imports: [FormsModule, DatePipe, RouterLink, SkeletonRows, Pagination],
  templateUrl: './drivers.html',
})
export class Drivers {
  private readonly api = inject(DriversApi);

  readonly statusLabels = DRIVER_STATUS_LABELS;
  readonly items = signal<DriverListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<DriverStatus | ''>('');

  search = '';

  readonly pageSize = PAGE_SIZE;

  constructor() {
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({
        ...(this.statusFilter() ? { status: this.statusFilter() } : {}),
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        page: this.page(),
        limit: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
          );
        },
      });
  }

  setStatus(status: DriverStatus | ''): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  onSearch(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }

  /** Initials for the avatar chip in the name cell (Pro table pattern). */
  initials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Pill color classes per tone. */
  readonly tariffToneClasses: Record<BadgeTone, string> = {
    accent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    warning: 'bg-gold-200 text-gold-800',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };

  /**
   * Descriptive tariff badge for a row. Reads the DRIVER status first (rejected,
   * pending, paused, arrears) and falls back to the subscription coverage, so the
   * dominant case — a pending driver whose tariff is `scheduled` — reads "Por
   * activar" instead of the old catch-all "Programada".
   */
  tariffBadge(item: DriverListItem): TariffBadge {
    const sub = item.subscription;
    // Rejected: the tariff no longer applies (refunded on rejection).
    if (item.status === 'rejected') return { label: '—', sub: '', date: null, tone: 'neutral' };
    if (!sub) return { label: 'Sin tarifa', sub: 'No ha elegido plan', date: null, tone: 'neutral' };
    // Administrative pause (licencia) freezes the tariff clock.
    if (item.status === 'paused') return { label: 'Congelada', sub: 'En pausa (licencia)', date: null, tone: 'neutral' };
    // A pending driver's tariff only activates once his alta is PAID and approved,
    // so split the three cases instead of a blanket "Por activar":
    if (item.status === 'pending') {
      if (item.hasPendingSubmission) return { label: 'Pago en revisión', sub: 'Se activa al aprobarlo', date: null, tone: 'accent' };
      if (Number(item.debtUsd) > 0) return { label: 'Falta pago', sub: `Debe $${item.debtUsd}`, date: null, tone: 'warning' };
      return { label: 'Por activar', sub: 'Inicia cuando lo apruebes', date: null, tone: 'accent' };
    }
    // The debt engine flagged him: coverage lapsed and he owes.
    if (item.status === 'overdue' || item.status === 'penalized') return { label: 'Vencida', sub: 'En deuda', date: null, tone: 'danger' };
    // Operative driver: read the coverage of his subscription.
    if (sub.status === 'expired') return { label: 'Vencida', sub: 'En deuda', date: null, tone: 'danger' };
    if (sub.dueSoon) return { label: 'Por vencer', sub: 'Vence el', date: sub.currentPeriodEnd, tone: 'warning' };
    if (sub.status === 'active') return { label: 'Al día', sub: 'Puede operar · hasta', date: sub.currentPeriodEnd, tone: 'success' };
    if (sub.status === 'scheduled') return { label: 'Cambio programado', sub: 'Nuevo plan por iniciar', date: null, tone: 'neutral' };
    return { label: 'Por activar', sub: 'Inicia cuando lo apruebes', date: null, tone: 'accent' };
  }

  /**
   * Descriptive status badge: the driver status + a plain-language line. For a
   * pending driver the line says what the admin needs (register the payment,
   * approve the pending payment, or that he is ready to approve).
   */
  statusBadge(item: DriverListItem): StatusBadge {
    switch (item.status) {
      case 'approved':
        return { label: 'Aprobado', sub: 'Activo en el sistema', dot: 'bg-green-500' };
      case 'rejected':
        return { label: 'Rechazado', sub: 'Solicitud descartada', dot: 'bg-primary-700 dark:bg-primary-400' };
      case 'suspended':
        return { label: 'Suspendido', sub: 'Bloqueado · no opera', dot: 'bg-gray-400' };
      case 'paused':
        return { label: 'Pausado', sub: 'En licencia temporal', dot: 'bg-blue-500' };
      case 'overdue':
        return { label: 'En mora', sub: 'Debe · sigue operando', dot: 'bg-amber-500' };
      case 'penalized':
        return { label: 'Penalizado', sub: 'No opera hasta saldar', dot: 'bg-red-500' };
      default: {
        if (item.hasPendingSubmission) return { label: 'Pendiente', sub: 'Tiene un pago por aprobar', dot: 'bg-gold-400' };
        if (Number(item.debtUsd) > 0) return { label: 'Pendiente', sub: 'Faltan pagos por registrar', dot: 'bg-gold-400' };
        return { label: 'Pendiente', sub: 'Listo para aprobar', dot: 'bg-gold-400' };
      }
    }
  }
}
