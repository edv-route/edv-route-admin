import { Component, computed, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EMPTY, type Observable } from 'rxjs';
import { expand, last, map } from 'rxjs/operators';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { BillingApi } from '../billing/billing.api';
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_STATUS_LABELS,
  type InvoiceListItem,
  type PaymentListItem,
} from '../../core/models/billing.model';
import { DriversApi } from './drivers.api';

/** The list endpoints cap `limit` at 100, so we page through the ledger in 100s. */
const PAGE_SIZE = 100;

/**
 * Driver-focused payment history: a reduced, per-driver view of the global
 * Facturación screen (`/billing`). Lists the driver's payments (membership +
 * tariff charges: pending / paid / refunded) and lets the admin open each one's
 * detail, including the linked invoice's payment method, reference, payer bank
 * and receipt (comprobante). Reuses the existing billing endpoints.
 */
@Component({
  selector: 'app-driver-payments',
  imports: [DatePipe, RouterLink, FileViewer],
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
  /** Receipt shown in the modal viewer (null = closed). */
  readonly viewer = signal<FileViewerState | null>(null);
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
    // Load the driver's full ledger, paging by 100 (the endpoint's max limit).
    this.loadAll<PaymentListItem>((page) =>
      this.billingApi.payments({ driverId, page, limit: PAGE_SIZE }),
    ).subscribe({
      next: (items) => {
        this.payments.set(items);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.fail(err);
      },
    });
    this.loadAll<InvoiceListItem>((page) =>
      this.billingApi.invoices({ driverId, page, limit: PAGE_SIZE }),
    ).subscribe({
      next: (items) => this.invoices.set(items),
      error: () => {},
    });
  }

  /** Fetches every page of a driver-scoped list and concatenates the items. */
  private loadAll<T>(
    fetch: (page: number) => Observable<{ items: T[]; total: number }>,
  ): Observable<T[]> {
    const acc: T[] = [];
    return fetch(1).pipe(
      expand((res) => {
        acc.push(...res.items);
        return acc.length < res.total && res.items.length > 0
          ? fetch(Math.floor(acc.length / PAGE_SIZE) + 1)
          : EMPTY;
      }),
      last(),
      map(() => acc),
    );
  }

  openDetail(payment: PaymentListItem): void {
    this.error.set(null);
    this.viewer.set(null);
    this.selected.set(payment);
  }

  closeDetail(): void {
    this.selected.set(null);
    this.viewer.set(null);
  }

  /** Loads the receipt's signed URL and shows it in the shared modal viewer. */
  viewProof(invoiceId: string): void {
    if (this.viewer()?.loading) return;
    const title = 'Comprobante de pago';
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.billingApi.invoiceProofUrl(invoiceId).subscribe({
      next: ({ url }) => this.viewer.set({ title, url, loading: false, error: null }),
      error: (err: HttpErrorResponse) =>
        this.viewer.set({
          title,
          url: null,
          loading: false,
          error:
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        }),
    });
  }

  private fail(err: HttpErrorResponse): void {
    this.error.set(
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
    );
  }
}
