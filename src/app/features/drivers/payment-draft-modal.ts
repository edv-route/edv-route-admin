import { Component, type OnInit, input, output, signal, viewChild } from '@angular/core';
import { PaymentCapture, type PaymentCaptureValue, emptyPaymentCapture } from './payment-capture';

/**
 * A payment captured in the registration wizard (draft; nothing is persisted).
 * Extends the raw capture value with readable labels so the wizard can show a
 * summary card (method + payer bank) without re-fetching the payment methods.
 */
export interface PaymentDraft extends PaymentCaptureValue {
  methodLabel: string | null;
  bankLabel: string | null;
}

/**
 * Add/edit-payment dialog for the registration wizard. Pure client-side capture:
 * it NEVER touches the backend. Wraps the shared `app-payment-capture`; on confirm
 * (only enabled when the capture is complete) it emits a `PaymentDraft` the wizard
 * holds and sends in the single `POST /drivers/register` transaction.
 */
@Component({
  selector: 'app-payment-draft-modal',
  imports: [PaymentCapture],
  templateUrl: './payment-draft-modal.html',
})
export class PaymentDraftModal implements OnInit {
  /** Charge total shown for context (e.g. "$185.00"), or null to hide it. */
  readonly totalUsd = input<string | null>(null);
  /** When set, the dialog opens in "edit" mode seeded with this value. */
  readonly initial = input<PaymentCaptureValue | null>(null);
  readonly saved = output<PaymentDraft>();
  readonly cancel = output<void>();

  private readonly pc = viewChild.required<PaymentCapture>('pc');
  readonly value = signal<PaymentCaptureValue>(emptyPaymentCapture());
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const seed = this.initial();
    if (seed) this.value.set({ ...seed });
  }

  confirm(): void {
    const pc = this.pc();
    if (!pc.complete()) return;
    this.saved.emit({
      ...this.value(),
      methodLabel: pc.selectedMethodName(),
      bankLabel: pc.payerBankLabel(),
    });
  }
}
