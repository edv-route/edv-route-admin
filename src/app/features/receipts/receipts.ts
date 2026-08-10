import { Component, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { SubmissionListItem, SubmissionStatus } from '../../core/models/payment-submission.model';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { Pagination } from '../../shared/components/pagination';
import { PaymentSubmissionsApi } from '../billing/payment-submissions.api';

const PAGE_SIZE = 10;

/** Status filter for the receipts list: 'all' plus the four submission statuses. */
type StatusFilter = 'all' | SubmissionStatus;

/**
 * Recibos de pagos: the money-IN screen (payment_submissions). Split out of
 * Facturación (2026-08-07) so Facturación owns only invoices. A single table with
 * a status filter (Todos · Pendiente · Aprobado · Revertido · Rechazado) and a
 * free-text search (payer name or receipt number) — replaces the old two-tab
 * control (2026-08-10). The search mirrors Facturación (submit on Enter). The
 * per-receipt detail (approve/reject/reverse) lives at /billing/submissions/:id.
 */
@Component({
  selector: 'app-receipts',
  imports: [FormsModule, DatePipe, RouterLink, SkeletonRows, Pagination],
  templateUrl: './receipts.html',
})
export class Receipts {
  private readonly submissionsApi = inject(PaymentSubmissionsApi);

  /** Optional deep-link (?tab=review, e.g. after registering an alta) → Pendiente. */
  readonly initialTab = input<string | undefined>(undefined, { alias: 'tab' });

  readonly statusFilter = signal<StatusFilter>('all');
  readonly items = signal<SubmissionListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Free-text search (payer name or receipt number); applied live (debounced). */
  search = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly pageSize = PAGE_SIZE;

  /** Filter chips above the table. */
  readonly filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'approved', label: 'Aprobado' },
    { value: 'reverted', label: 'Revertido' },
    { value: 'rejected', label: 'Rechazado' },
  ];

  ngOnInit(): void {
    if (this.initialTab() === 'review') this.statusFilter.set('pending');
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(): void {
    this.loading.set(true);
    const status = this.statusFilter();
    const term = this.search.trim();
    this.submissionsApi
      .list({
        ...(status !== 'all' ? { status } : {}),
        ...(term ? { search: term } : {}),
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

  setFilter(value: StatusFilter): void {
    if (this.statusFilter() === value) return;
    this.statusFilter.set(value);
    this.applyFilters();
  }

  /** Runs the search + current filter from page 1 (chip change / Enter). */
  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  /** Live search: reloads 300ms after the last keystroke (Enter still applies now). */
  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }
}
