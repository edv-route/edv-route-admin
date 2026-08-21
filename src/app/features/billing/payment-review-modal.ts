import { Component, type OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FolioPipe } from '../../shared/pipes/folio.pipe';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { HttpErrorResponse } from '@angular/common/http';
import { PaymentSubmissionsApi } from './payment-submissions.api';
import {
  SUBMISSION_PURPOSE_LABELS,
  type SubmissionDetail,
} from '../../core/models/payment-submission.model';

/**
 * Review modal for a payment under review (opened from the affiliate profile's
 * payment cards). Loads the full submission on open and shows the money, the payer
 * details, the breakdown of invoices it covers and its receipt image(s). BOTH
 * actions happen right here, no navigation: approve settles what it covers and
 * emits the invoice; reject keeps the trace with a reason so the driver can resend.
 * It emits `resolved` so the parent refreshes and offers "Establecer inicio" when
 * the tariff start became due. (Reverse — only for already-approved receipts —
 * still lives in the full detail page, reached from Facturación.)
 */
@Component({
  selector: 'app-payment-review-modal',
  imports: [DatePipe, FormsModule, FolioPipe, BusyDirective],
  templateUrl: './payment-review-modal.html',
})
export class PaymentReviewModal implements OnInit {
  private readonly api = inject(PaymentSubmissionsApi);

  /** Submission id to show. */
  readonly submissionId = input.required<string>();
  readonly close = output<void>();
  /** Emitted after the payment is approved OR rejected here, so the parent
   *  refreshes its data (debt, pending cards) and offers "Establecer inicio"
   *  when it becomes due. */
  readonly resolved = output<void>();

  readonly detail = signal<SubmissionDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Receipt image being zoomed (full-screen), or null. */
  readonly zoomed = signal<string | null>(null);
  /** Which action's inline confirm step is showing in the footer (null = none). */
  readonly action = signal<'approve' | 'reject' | null>(null);
  /** In-flight guard for the approve/reject request. */
  readonly saving = signal(false);
  /** Error raised by the approve/reject action (kept apart from the load `error`). */
  readonly actionError = signal<string | null>(null);
  /** Reason typed for a rejection (required by the backend). */
  rejectReason = '';

  /**
   * The verdict LANDED, and this modal now confirms it instead of closing.
   *
   * The affiliate's profile used to carry a permanent «Pago rechazado» banner
   * that stayed there for good, repeating two lines the admin already knew and
   * taking room from what he actually reads (2026-08-21). The verdict is a
   * moment, not a state of the profile: it is said once, where it happened.
   */
  readonly done = signal<'approve' | 'reject' | null>(null);

  readonly purposeLabel = computed(() => {
    const d = this.detail();
    return d ? (SUBMISSION_PURPOSE_LABELS[d.purpose] ?? 'Pago') : '';
  });

  ngOnInit(): void {
    this.api.detail(this.submissionId()).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          (err.error as { message?: string } | null)?.message ?? 'No se pudo cargar el pago.',
        );
      },
    });
  }

  isPdf(url: string): boolean {
    return /\.pdf(\?|$)/i.test(url);
  }

  /** Opens the inline confirm step for an action. Approving moves money (emits the
   *  invoice, settles what it covers); rejecting keeps the trace with a reason so
   *  the driver can resend. Both take a deliberate second click. */
  ask(action: 'approve' | 'reject'): void {
    this.actionError.set(null);
    if (action === 'reject') this.rejectReason = '';
    this.action.set(action);
  }

  /** Backs out of the confirm step (blocked while a request is in flight). */
  cancel(): void {
    if (this.saving()) return;
    this.action.set(null);
    this.actionError.set(null);
  }

  /** Approves the payment on the spot and notifies the parent so it refreshes
   *  without leaving the profile. The parent unmounts this modal on `resolved`. */
  approve(): void {
    const d = this.detail();
    if (!d || this.saving()) return;
    this.saving.set(true);
    this.actionError.set(null);
    this.api.approve(d.id).subscribe({
      next: () => this.finish('approve'),
      error: (err: HttpErrorResponse) => this.failAction(err, 'No se pudo aprobar el pago.'),
    });
  }

  /** Rejects the payment with a required reason; keeps the trace so the driver can
   *  resend. Notifies the parent to refresh on success. */
  reject(): void {
    const d = this.detail();
    if (!d || this.saving()) return;
    const reason = this.rejectReason.trim();
    if (!reason) {
      this.actionError.set('Indica el motivo del rechazo.');
      return;
    }
    this.saving.set(true);
    this.actionError.set(null);
    this.api.reject(d.id, reason).subscribe({
      next: () => this.finish('reject'),
      error: (err: HttpErrorResponse) => this.failAction(err, 'No se pudo rechazar el pago.'),
    });
  }

  /**
   * Shows the outcome INSIDE the modal and tells the parent to refresh straight
   * away, so the figures behind are already fresh when the admin closes it.
   */
  private finish(verdict: 'approve' | 'reject'): void {
    this.saving.set(false);
    this.action.set(null);
    this.done.set(verdict);
    this.resolved.emit();
  }

  /** Surfaces an action error and releases the in-flight guard, leaving the confirm
   *  step open so the admin can read it, fix and retry (or cancel). */
  private failAction(err: HttpErrorResponse, fallback: string): void {
    this.saving.set(false);
    this.actionError.set((err.error as { message?: string } | null)?.message ?? fallback);
  }
}
