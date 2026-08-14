import { Component, inject, input, signal } from '@angular/core';
import { FolioPipe, padFolio } from '../../shared/pipes/folio.pipe';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  SUBMISSION_PURPOSE_LABELS,
  type SubmissionListItem,
} from '../../core/models/payment-submission.model';
import { Pagination } from '../../shared/components/pagination';
import { PaymentSubmissionsApi } from '../billing/payment-submissions.api';
import { DriversApi } from './drivers.api';

const PAGE_SIZE = 10;

/**
 * Driver payment history (billing redesign 2026-08-04): one row per RECEIPT
 * (payment) — membership + its weeks are ONE payment, not N. "Ver detalles" opens
 * the receipt screen (/billing/submissions/:id), where each invoice shows its N°.
 * Server-side paginated: a driver accrues many receipts over time (weekly billing).
 */
@Component({
  selector: 'app-driver-payments',
  imports: [DatePipe, RouterLink, Pagination, FolioPipe],
  templateUrl: './driver-payments.html',
})
export class DriverPayments {
  private readonly submissionsApi = inject(PaymentSubmissionsApi);
  private readonly driversApi = inject(DriversApi);

  readonly id = input.required<string>();
  readonly purposeLabels = SUBMISSION_PURPOSE_LABELS;

  readonly driverName = signal<string>('');
  readonly receipts = signal<SubmissionListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;

  ngOnInit(): void {
    // Driver name is fetched once; the receipts page (re)loads on navigation.
    this.driversApi.detail(this.id()).subscribe({
      next: (d) => this.driverName.set(d.fullName),
      error: () => {},
    });
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  /** "Cubre factura #5" / "Cubre facturas #5, #6" — empty when there are none yet. */
  invoiceLabel(numbers: string[] | null): string {
    if (!numbers || numbers.length === 0) return '';
    const noun = numbers.length === 1 ? 'factura' : 'facturas';
    return `Cubre ${noun} ${numbers.map((n) => '#' + padFolio(n)).join(', ')}`;
  }

  load(): void {
    this.loading.set(true);
    this.submissionsApi
      .list({ driverId: this.id(), page: this.page(), limit: PAGE_SIZE })
      .subscribe({
        next: (result) => {
          this.receipts.set(result.items);
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

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }
}
