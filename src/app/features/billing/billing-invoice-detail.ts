import { Component, inject, input, signal } from '@angular/core';
import { FolioPipe } from '../../shared/pipes/folio.pipe';
import { DatePipe, Location } from '@angular/common';
import type { HttpErrorResponse } from '@angular/common/http';
import { INVOICE_STATUS_LABELS, type InvoiceDetail } from '../../core/models/billing.model';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { BillingApi } from './billing.api';
import { PaymentSubmissionsApi } from './payment-submissions.api';

interface Proof {
  url: string;
  label: string;
}

/**
 * Full invoice detail (route /billing/:id): all the invoice + payment data and
 * its receipts shown INLINE (no click needed). Newer invoices carry 1..5 images
 * from their v9 submission; legacy ones a single `proof_url`. Read-only — an
 * invoice only exists once its payment was approved, so there is nothing to
 * approve/reject here (that lives on the pending submission).
 */
@Component({
  selector: 'app-billing-invoice-detail',
  imports: [DatePipe, FileViewer, FolioPipe],
  templateUrl: './billing-invoice-detail.html',
})
export class BillingInvoiceDetail {
  private readonly api = inject(BillingApi);
  private readonly submissionsApi = inject(PaymentSubmissionsApi);
  private readonly location = inject(Location);

  readonly id = input.required<string>();
  readonly statusLabels = INVOICE_STATUS_LABELS;

  readonly invoice = signal<InvoiceDetail | null>(null);
  readonly proofs = signal<Proof[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Modal viewer for zooming a receipt (inline previews are always visible). */
  readonly viewer = signal<FileViewerState | null>(null);

  ngOnInit(): void {
    this.api.invoiceDetail(this.id()).subscribe({
      next: (inv) => {
        this.invoice.set(inv);
        this.loading.set(false);
        if (inv.submissionId) {
          this.submissionsApi.detail(inv.submissionId).subscribe({
            next: (s) =>
              this.proofs.set(s.files.map((f) => ({ url: f.url, label: `Comprobante ${f.position}` }))),
            error: () => {},
          });
        } else if (inv.hasProof) {
          this.api.invoiceProofUrl(inv.id).subscribe({
            next: ({ url }) => this.proofs.set([{ url, label: 'Comprobante' }]),
            error: () => {},
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          (err.error as { message?: string } | null)?.message ?? 'No se pudo cargar la factura',
        );
      },
    });
  }

  isPdf(url: string): boolean {
    return url.split('?')[0].toLowerCase().endsWith('.pdf');
  }

  zoom(proof: Proof): void {
    this.viewer.set({ title: proof.label, url: proof.url, loading: false, error: null });
  }

  back(): void {
    this.location.back();
  }
}
