import { Component, input, model } from '@angular/core';

/**
 * Branded on/off switch with an inline label + optional hint, two-way `[(checked)]`.
 * Stateless (shared): used for opt-in toggles such as "approve the payment
 * immediately". The whole control is a single `role="switch"` button so a click
 * anywhere on it flips the value and it stays accessible.
 */
@Component({
  selector: 'app-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      (click)="checked.set(!checked())"
      class="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-700/30 dark:hover:bg-gray-700/50"
    >
      <span
        class="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors"
        [class]="checked() ? 'bg-primary-700' : 'bg-gray-300 dark:bg-gray-600'"
      >
        <span
          class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
          [class]="checked() ? 'left-[18px]' : 'left-0.5'"
        ></span>
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-gray-800 dark:text-gray-100">{{ label() }}</span>
        @if (hint()) {
          <span class="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">{{ hint() }}</span>
        }
      </span>
    </button>
  `,
})
export class Toggle {
  /** Two-way switch state. */
  readonly checked = model(false);
  /** Bold title shown beside the switch. */
  readonly label = input('');
  /** Optional smaller explanation under the label. */
  readonly hint = input('');
}
