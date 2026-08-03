import { Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import {
  SUBMISSION_PURPOSE_LABELS,
  SUBMISSION_STATUS_LABELS,
  type SubmissionDetail,
} from '../../core/models/payment-submission.model';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { PaymentSubmissionsApi } from './payment-submissions.api';

/**
 * Full submission review (route /billing/submissions/:id): the payment data and
 * its receipts shown INLINE, with Approve / Reject actions when it is still
 * pending. Approving settles the debt / prepays the weeks and emits the invoice;
 * rejecting keeps the trace and lets the driver resend.
 */
@Component({
  selector: 'app-payment-submission-detail',
  imports: [DatePipe, FormsModule, RouterLink, FileViewer],
  templateUrl: './payment-submission-detail.html',
})
export class PaymentSubmissionDetail {
  private readonly api = inject(PaymentSubmissionsApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly statusLabels = SUBMISSION_STATUS_LABELS;
  readonly purposeLabels = SUBMISSION_PURPOSE_LABELS;

  readonly submission = signal<SubmissionDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  /** Which confirmation modal is open (null = none). */
  readonly confirmAction = signal<'approve' | 'reject' | null>(null);
  rejectReason = '';
  readonly viewer = signal<FileViewerState | null>(null);

  private static msg(err: HttpErrorResponse, fallback: string): string {
    return (err.error as { message?: string } | null)?.message ?? fallback;
  }

  ngOnInit(): void {
    this.api.detail(this.id()).subscribe({
      next: (s) => {
        this.submission.set(s);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(PaymentSubmissionDetail.msg(err, 'No se pudo cargar el pago'));
      },
    });
  }

  isPdf(url: string): boolean {
    return url.split('?')[0].toLowerCase().endsWith('.pdf');
  }

  zoom(url: string, label: string): void {
    this.viewer.set({ title: label, url, loading: false, error: null });
  }

  back(): void {
    void this.router.navigate(['/billing'], { queryParams: { tab: 'review' } });
  }

  /** Opens the approve/reject confirmation modal. */
  openConfirm(action: 'approve' | 'reject'): void {
    this.error.set(null);
    if (action === 'reject') this.rejectReason = '';
    this.confirmAction.set(action);
  }

  closeConfirm(): void {
    if (this.saving()) return;
    this.confirmAction.set(null);
    this.error.set(null);
  }

  approve(): void {
    const sub = this.submission();
    if (!sub || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.approve(sub.id).subscribe({
      next: () => this.back(),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.confirmAction.set(null);
        this.error.set(PaymentSubmissionDetail.msg(err, 'No se pudo aprobar el pago'));
      },
    });
  }

  reject(): void {
    const sub = this.submission();
    if (!sub || this.saving()) return;
    const reason = this.rejectReason.trim();
    if (!reason) {
      this.error.set('Indica el motivo del rechazo.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api.reject(sub.id, reason).subscribe({
      next: () => this.back(),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.confirmAction.set(null);
        this.error.set(PaymentSubmissionDetail.msg(err, 'No se pudo rechazar el pago'));
      },
    });
  }
}
