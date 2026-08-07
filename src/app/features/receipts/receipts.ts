import { Component, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { SubmissionListItem } from '../../core/models/payment-submission.model';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { Pagination } from '../../shared/components/pagination';
import { PaymentSubmissionsApi } from '../billing/payment-submissions.api';

const PAGE_SIZE = 10;

/** Receipts screen tabs: every payment vs. the pending-approval inbox. */
type ReceiptsTab = 'all' | 'review';

/**
 * Recibos de pagos: the money-IN screen (payment_submissions). Split out of
 * Facturación (2026-08-07) so Facturación owns only invoices. Two tabs:
 *  - `all` ("Pagos"): every receipt (approved / pending / rejected / reverted).
 *  - `review` ("Por aprobar"): pending receipts awaiting an admin decision.
 * The per-receipt detail still lives at /billing/submissions/:id (shared with the
 * invoices screen); navigating back from it uses Location.back().
 */
@Component({
  selector: 'app-receipts',
  imports: [DatePipe, RouterLink, SkeletonRows, Pagination],
  templateUrl: './receipts.html',
})
export class Receipts {
  private readonly submissionsApi = inject(PaymentSubmissionsApi);

  /** Optional starting tab (?tab=review, e.g. after registering an alta). */
  readonly initialTab = input<string | undefined>(undefined, { alias: 'tab' });

  readonly tab = signal<ReceiptsTab>('all');
  readonly items = signal<SubmissionListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;

  ngOnInit(): void {
    if (this.initialTab() === 'review') this.tab.set('review');
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(): void {
    this.loading.set(true);
    this.submissionsApi
      .list({
        ...(this.tab() === 'review' ? { status: 'pending' as const } : {}),
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

  setTab(tab: ReceiptsTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }
}
