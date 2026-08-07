import { Component, computed, input, output } from '@angular/core';

/** One slot in the page strip: a concrete page number or an ellipsis gap. */
type PageSlot = number | 'ellipsis';

/**
 * Numbered pagination (Flowbite Pro table footer). Stateless: the parent owns the
 * current page and reloads its data on `pageChange`. Renders "Mostrando X–Y de Z"
 * plus a windowed number strip (1 … 4 [5] 6 … 100); the active page uses the brand
 * color. Meant for server-side paginated lists that expose `{ items, total }`.
 */
@Component({
  selector: 'app-pagination',
  standalone: true,
  templateUrl: './pagination.html',
})
export class Pagination {
  /** Current page, 1-based. */
  readonly page = input.required<number>();
  /** Total number of records across every page. */
  readonly total = input.required<number>();
  /** Records per page (must match the `limit` the parent sends to the API). */
  readonly pageSize = input(20);

  /** Emits the requested page, already clamped to [1, totalPages]. */
  readonly pageChange = output<number>();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  /** First/last record index shown on the current page (for "Mostrando X–Y de Z"). */
  readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  /** Windowed page strip with ellipsis gaps; every page when there are few (≤7). */
  readonly slots = computed<PageSlot[]>(() => {
    const last = this.totalPages();
    const current = this.page();
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    const slots: PageSlot[] = [1];
    const left = Math.max(2, current - 1);
    const right = Math.min(last - 1, current + 1);
    if (left > 2) slots.push('ellipsis');
    for (let p = left; p <= right; p++) slots.push(p);
    if (right < last - 1) slots.push('ellipsis');
    slots.push(last);
    return slots;
  });

  /** Guarded navigation: clamps the target and only emits on a real change. */
  go(page: number): void {
    const target = Math.min(Math.max(1, page), this.totalPages());
    if (target !== this.page()) this.pageChange.emit(target);
  }
}
