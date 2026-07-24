import { Component, computed, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BillingApi } from '../billing/billing.api';
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
  type InvoiceListItem,
  type PaymentListItem,
} from '../../core/models/billing.model';
import { DriversApi } from './drivers.api';

/**
 * Driver-focused payment history: a reduced, per-driver view of the global
 * Facturación screen (`/billing`). Lists the driver's payments (membership +
 * tariff charges: pending / paid / refunded) and lets the admin open each one's
 * detail, including the linked invoice's payment method, reference, payer bank
 * and receipt (comprobante). Reuses the existing billing endpoints.
 */
@Component({
  selector: 'app-driver-payments',
  imports: [DatePipe, RouterLink],
  templateUrl: './driver-payments.html',
})
export class DriverPayments {
  private readonly billingApi = inject(BillingApi);
  private readonly driversApi = inject(DriversApi);

  readonly id = input.required<string>();
  readonly kindLabels = PAYMENT_KIND_LABELS;
  readonly statusLabels = PAYMENT_STATUS_LABELS;

  readonly driverName = signal<string>('');
  readonly payments = signal<PaymentListItem[]>([]);
  readonly invoices = signal<InvoiceListItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly loadingProof = signal(false);
  /** The payment whose detail modal is open (null = closed). */
  readonly selected = signal<PaymentListItem | null>(null);

  private readonly invoicesById = computed(() => {
    const map = new Map<string, InvoiceListItem>();
    for (const inv of this.invoices()) map.set(inv.id, inv);
    return map;
  });

  /** Invoice (with the payment details) linked to the selected payment, if any. */
  readonly selectedInvoice = computed<InvoiceListItem | null>(() => {
    const p = this.selected();
    return p?.invoiceId ? (this.invoicesById().get(p.invoiceId) ?? null) : null;
  });

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
    // A generous page: a single driver's ledger is small; no paging needed here.
    this.billingApi.payments({ driverId, page: 1, limit: 200 }).subscribe({
      next: (r) => {
        this.payments.set(r.items);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.fail(err);
      },
    });
    this.billingApi.invoices({ driverId, page: 1, limit: 200 }).subscribe({
      next: (r) => this.invoices.set(r.items),
      error: () => {},
    });
  }

  openDetail(payment: PaymentListItem): void {
    this.error.set(null);
    this.selected.set(payment);
  }

  /** Opens the receipt of the selected payment's invoice in a new tab (signed URL). */
  viewProof(invoiceId: string): void {
    if (this.loadingProof()) return;
    this.loadingProof.set(true);
    this.billingApi.invoiceProofUrl(invoiceId).subscribe({
      next: ({ url }) => {
        this.loadingProof.set(false);
        window.open(url, '_blank', 'noopener');
      },
      error: (err: HttpErrorResponse) => {
        this.loadingProof.set(false);
        this.fail(err);
      },
    });
  }

  private fail(err: HttpErrorResponse): void {
    this.error.set(
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
    );
  }
}
