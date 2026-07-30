import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Select, type SelectOption } from '../../shared/components/select';
import { validateFile } from '../documents/documents.api';
import { PaymentMethodsApi } from '../payment-methods/payment-methods.api';
import {
  PAYMENT_METHOD_FIELDS,
  PAYMENT_METHOD_TYPE_LABELS,
  VENEZUELAN_BANKS,
  type PaymentMethod,
} from '../../core/models/payment-method.model';

/** Payment details captured at cobro time (Pieza 2), plus the receipt file. */
export interface PaymentCaptureValue {
  paymentMethodId: number | null;
  reference: string | null;
  payerBank: string | null;
  file: File | null;
}

export const emptyPaymentCapture = (): PaymentCaptureValue => ({
  paymentMethodId: null,
  reference: null,
  payerBank: null,
  file: null,
});

/**
 * Reusable payment-capture block (method + account details + reference + payer
 * bank + receipt), shared by every cobro in the drivers feature: the registration
 * wizard and the enroll / renewal / external-payment modals. Two-column layout on
 * web. It owns the payment-methods lookup and the file validation, exposing the
 * captured value through `[(value)]` and rejected-file messages through `fileError`.
 */
@Component({
  selector: 'app-payment-capture',
  imports: [FormsModule, Select],
  templateUrl: './payment-capture.html',
})
export class PaymentCapture {
  private readonly paymentMethodsApi = inject(PaymentMethodsApi);

  /** Two-way value: the parent reads it on submit and resets it by setting a fresh one. */
  readonly value = model<PaymentCaptureValue>(emptyPaymentCapture());
  /** Whether the payment block is optional. Only labelling — consumers still gate
   *  their submit on `complete`. Set false when the cobro must not be left blank. */
  readonly optional = input(true);
  /** A human message when the chosen file is rejected (size/type), or null when cleared. */
  readonly fileError = output<string | null>();

  private readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly bankOptions = VENEZUELAN_BANKS;
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    this.paymentMethodsApi.list().subscribe({
      next: (m) => this.paymentMethods.set(m),
      error: () => {},
    });
  }

  /** Active payment methods offered when registering a payment. */
  readonly methodOptions = computed<SelectOption[]>(() =>
    this.paymentMethods()
      .filter((m) => m.isActive)
      .map((m) => ({ value: m.id, label: `${m.name} · ${PAYMENT_METHOD_TYPE_LABELS[m.type]}` })),
  );

  /** Details of the selected method, mapped to human labels so the admin can
   * confirm the account the driver paid into. Select values resolve to their
   * readable option label; empty details are dropped. */
  readonly selectedMethodDetails = computed<{ label: string; value: string }[]>(() => {
    const method = this.paymentMethods().find((m) => m.id === this.value().paymentMethodId);
    if (!method) return [];
    return PAYMENT_METHOD_FIELDS[method.type]
      .map((field) => {
        const raw = method.details[field.key]?.trim();
        if (!raw) return null;
        const value =
          field.control === 'select'
            ? (field.options?.find((o) => o.value === raw)?.label ?? raw)
            : raw;
        return { label: field.label, value };
      })
      .filter((row): row is { label: string; value: string } => row !== null);
  });

  /**
   * Whether the payment is complete enough to invoice, validated per method
   * (decision 2026-07-28): a method and a receipt are always required; a
   * reference is required except for "contact"; the payer bank only for the
   * Venezuelan-bank methods (transfer / pago móvil). Consumers gate their
   * submit on this (e.g. the wizard's "Registrar y facturar").
   */
  readonly complete = computed<boolean>(() => {
    const v = this.value();
    const method = this.paymentMethods().find((m) => m.id === v.paymentMethodId);
    if (!method || !v.file) return false;
    if (method.type !== 'contact' && !v.reference?.trim()) return false;
    if ((method.type === 'bank_transfer' || method.type === 'pago_movil') && !v.payerBank) return false;
    return true;
  });

  setMethod(id: number | null): void {
    this.value.update((v) => ({ ...v, paymentMethodId: id }));
  }

  setReference(reference: string): void {
    this.value.update((v) => ({ ...v, reference: reference.trim() || null }));
  }

  setBank(bank: string | null): void {
    this.value.update((v) => ({ ...v, payerBank: bank }));
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file) {
      const problem = validateFile(file);
      if (problem) {
        this.fileError.emit(problem);
        this.value.update((v) => ({ ...v, file: null }));
        return;
      }
    }
    this.fileError.emit(null);
    this.value.update((v) => ({ ...v, file }));
  }

  /** Clears the chosen receipt and resets the native input so the same file re-picks. */
  clearFile(): void {
    this.value.update((v) => ({ ...v, file: null }));
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }
}
