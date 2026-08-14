import { Component, type OnInit, computed, input, output, signal, viewChild } from '@angular/core';
import { PaymentCapture, type PaymentCaptureValue, emptyPaymentCapture } from './payment-capture';
import { Toggle } from '../../shared/components/toggle';

/**
 * A payment captured in the registration wizard (draft; nothing is persisted).
 * Extends the raw capture value with readable labels so the wizard can show a
 * summary card (method + payer bank) without re-fetching the payment methods.
 */
export interface PaymentDraft extends PaymentCaptureValue {
  methodLabel: string | null;
  bankLabel: string | null;
  /**
   * Admin-only toggle: approve the alta payment on the spot (autoApprove) instead
   * of leaving it pending for a second review in Facturación. Off by default.
   */
  autoApprove: boolean;
}

/**
 * Add/edit-payment dialog for the registration wizard. Pure client-side capture:
 * it NEVER touches the backend. Wraps the shared `app-payment-capture`; on confirm
 * (only enabled when the capture is complete) it emits a `PaymentDraft` the wizard
 * holds and sends in the single `POST /drivers/register` transaction.
 */
@Component({
  selector: 'app-payment-draft-modal',
  imports: [PaymentCapture, Toggle],
  templateUrl: './payment-draft-modal.html',
})
export class PaymentDraftModal implements OnInit {
  /** Charge total shown for context (e.g. "$185.00"), or null to hide it. */
  readonly totalUsd = input<string | null>(null);
  // Itemized breakdown (like a receipt) shown next to the total for clarity.
  readonly membershipName = input('');
  readonly membershipUsd = input<string | null>(null);
  readonly tariffUsd = input<string | null>(null);
  readonly periods = input(1);
  /** Tariff line total = unit price × weeks, 2 decimals; null when no tariff. */
  readonly tariffLineTotal = computed(() => {
    const price = this.tariffUsd();
    return price != null ? (Number(price) * this.periods()).toFixed(2) : null;
  });
  /** When set, the dialog opens in "edit" mode seeded with this value. */
  readonly initial = input<PaymentCaptureValue | null>(null);
  /** Seeds the "approve now" toggle when the dialog reopens in edit mode. */
  readonly initialAutoApprove = input(false);
  readonly saved = output<PaymentDraft>();
  readonly cancel = output<void>();

  private readonly pc = viewChild.required<PaymentCapture>('pc');
  readonly value = signal<PaymentCaptureValue>(emptyPaymentCapture());
  readonly error = signal<string | null>(null);
  /** Admin-only: approve the alta payment on the spot (off by default). */
  readonly autoApprove = signal(false);

  ngOnInit(): void {
    const seed = this.initial();
    if (seed) this.value.set({ ...seed });
    this.autoApprove.set(this.initialAutoApprove());
  }

  confirm(): void {
    const pc = this.pc();
    if (!pc.complete()) return;
    this.saved.emit({
      ...this.value(),
      methodLabel: pc.selectedMethodName(),
      bankLabel: pc.payerBankLabel(),
      autoApprove: this.autoApprove(),
    });
  }
}
