import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReviewPromptService } from './review-prompt.service';

/**
 * The "why are you rejecting this" dialog, shared by every screen that gives a
 * verdict. It renders nothing until the service opens it, so a host screen only
 * has to drop `<app-reject-prompt (rejected)="load()" />` at the end of its
 * template.
 */
@Component({
  selector: 'app-reject-prompt',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (review.target(); as target) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Rechazar {{ target.label }}
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Explica qué debe corregir. El afiliado verá este motivo en su app.
          </p>
          <textarea
            [(ngModel)]="review.reason"
            rows="3"
            maxlength="500"
            class="mt-3 w-full rounded-lg border border-gray-300 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Ej.: la foto está borrosa, no se lee."
          ></textarea>
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              (click)="review.close()"
              [disabled]="review.saving()"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              (click)="confirm()"
              [disabled]="review.saving() || !review.reason.trim()"
              class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {{ review.saving() ? 'Rechazando…' : 'Rechazar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class RejectPrompt {
  protected readonly review = inject(ReviewPromptService);

  /** Emitted once the rejection lands, so the host reloads its data. */
  readonly rejected = output<void>();

  /** Emitted with the backend's message when it fails. */
  readonly failed = output<string>();

  protected confirm(): void {
    this.review.confirmReject(
      () => this.rejected.emit(),
      (err) =>
        this.failed.emit(
          (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        ),
    );
  }
}
