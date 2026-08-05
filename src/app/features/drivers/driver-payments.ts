import { Component, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  SUBMISSION_PURPOSE_LABELS,
  type SubmissionListItem,
} from '../../core/models/payment-submission.model';
import { PaymentSubmissionsApi } from '../billing/payment-submissions.api';
import { DriversApi } from './drivers.api';

/**
 * Driver payment history (billing redesign 2026-08-04): one row per RECEIPT
 * (payment) — membership + its weeks are ONE payment, not N. "Ver detalles" opens
 * the receipt screen (/billing/submissions/:id), where each invoice shows its N°.
 */
@Component({
  selector: 'app-driver-payments',
  imports: [DatePipe, RouterLink],
  templateUrl: './driver-payments.html',
})
export class DriverPayments {
  private readonly submissionsApi = inject(PaymentSubmissionsApi);
  private readonly driversApi = inject(DriversApi);

  readonly id = input.required<string>();
  readonly purposeLabels = SUBMISSION_PURPOSE_LABELS;

  readonly driverName = signal<string>('');
  readonly receipts = signal<SubmissionListItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const driverId = this.id();
    this.driversApi.detail(driverId).subscribe({
      next: (d) => this.driverName.set(d.fullName),
      error: () => {},
    });
    // The list endpoint caps limit at 100; a driver's receipts fit well under it.
    this.submissionsApi.list({ driverId, page: 1, limit: 100 }).subscribe({
      next: (result) => {
        this.receipts.set(result.items);
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
}
