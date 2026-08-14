import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FolioPipe } from '../../shared/pipes/folio.pipe';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { INVOICE_STATUS_LABELS, type InvoiceListItem } from '../../core/models/billing.model';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { DriversApi } from '../drivers/drivers.api';
import { BillingApi } from './billing.api';
import { Pagination } from '../../shared/components/pagination';

const PAGE_SIZE = 10;

/**
 * Facturación: the invoices ledger — one invoice per concept (membership or tariff
 * week), with its status and the receipt that paid it. Receipts and the approval
 * inbox live in the Recibos de pagos screen (2026-08-07). Invoices-only: status
 * filter + search + per-driver history (the monthly chart was removed 2026-08-10).
 */
type InvoiceStatusFilter = '' | 'issued' | 'overdue' | 'paid' | 'voided';

@Component({
  selector: 'app-billing',
  imports: [FormsModule, DatePipe, RouterLink, SkeletonRows, Pagination, FolioPipe],
  templateUrl: './billing.html',
})
export class Billing {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);

  /** Bound from the query param (withComponentInputBinding) - per-driver history. */
  readonly driverId = input<string>();

  readonly invoiceStatusLabels = INVOICE_STATUS_LABELS;

  readonly invoices = signal<InvoiceListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly driverName = signal<string | null>(null);

  readonly invoiceStatus = signal<InvoiceStatusFilter>('');

  search = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly pageSize = PAGE_SIZE;

  constructor(driversApi: DriversApi) {
    // Reload whenever the bound driverId changes (including first binding).
    effect(() => {
      const id = this.driverId();
      untracked(() => {
        this.driverName.set(null);
        if (id) driversApi.detail(id).subscribe((d) => this.driverName.set(d.fullName));
        this.page.set(1);
        this.load();
      });
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(): void {
    this.loading.set(true);
    this.api
      .invoices({
        ...(this.driverId() ? { driverId: this.driverId() as string } : {}),
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        ...(this.invoiceStatus() ? { status: this.invoiceStatus() } : {}),
        page: this.page(),
        limit: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.invoices.set(result.items);
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

  setInvoiceStatus(status: InvoiceStatusFilter): void {
    this.invoiceStatus.set(status);
    this.applyFilters();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  /** Live search: reloads 300ms after the last keystroke (Enter still applies now). */
  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  clearDriver(): void {
    void this.router.navigate(['/billing']);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }
}
