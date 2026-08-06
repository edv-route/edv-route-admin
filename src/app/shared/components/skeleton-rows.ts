import { Component, computed, input } from '@angular/core';

/** Bar widths (%) cycled across columns so the skeleton looks varied, not uniform. */
const WIDTHS = [70, 55, 80, 45, 65, 50, 60];

/**
 * Table loading skeleton: renders `rows` ghost rows of `cols` pulsing bars, sized
 * to line up with the real columns. Shared and stateless — drop it straight inside
 * a `<tbody>` while the list loads (`@if (loading())`). The host is `display:
 * contents` so its `<tr>`s participate in the table layout as direct children.
 */
@Component({
  selector: 'app-skeleton-rows',
  standalone: true,
  host: { class: 'contents' },
  template: `
    @for (r of rowsArray(); track r) {
      <tr class="border-b border-gray-100 dark:border-gray-700/60">
        @for (c of colsArray(); track c) {
          <td class="px-4 py-3.5">
            <div
              class="h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
              [style.width.%]="width(c)"
            ></div>
          </td>
        }
      </tr>
    }
  `,
})
export class SkeletonRows {
  /** Ghost rows to render. */
  readonly rows = input(6);
  /** Columns per row — match the table's column count. */
  readonly cols = input(5);
  readonly rowsArray = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  readonly colsArray = computed(() => Array.from({ length: this.cols() }, (_, i) => i));
  width(col: number): number {
    return WIDTHS[col % WIDTHS.length]!;
  }
}
