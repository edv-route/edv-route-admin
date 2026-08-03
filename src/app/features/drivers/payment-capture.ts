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
import { DatePicker } from '../../shared/components/date-picker';
import { INPUT_FILTERS } from '../../shared/directives/input-filters';
import { validateFile } from '../documents/documents.api';
import { PaymentMethodsApi } from '../payment-methods/payment-methods.api';
import { NATIONAL_ID_OPTIONS, type NationalIdType } from './person-form';
import {
  PAYMENT_METHOD_FIELDS,
  PAYMENT_METHOD_TYPE_LABELS,
  VENEZUELAN_BANKS,
  type PaymentMethod,
} from '../../core/models/payment-method.model';

/** Today as ISO yyyy-MM-dd (the payment date defaults to today). */
const todayIso = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Payment details captured at cobro time (Pieza 2 + payer details 2026-07-31),
 * plus the receipt file. `paidOn` is the date the payer paid (defaults to
 * today). `payerPhone` (E.164) and `payerId` (V/E/J document) are captured for
 * Pago Móvil only — the phone/id the transfer came from.
 */
export interface PaymentCaptureValue {
  paymentMethodId: number | null;
  reference: string | null;
  payerBank: string | null;
  paidOn: string;
  payerPhone: string | null;
  payerId: string | null;
  /** Email or name the payment came FROM (Zelle/Binance). */
  payerAccount: string | null;
  /** Captured amount (USD): required for Efectivo Divisa (cash_usd). */
  amountUsd: string | null;
  /** Receipt(s): exactly 1 for the standard methods, up to 5 bill photos for cash. */
  files: File[];
}

export const emptyPaymentCapture = (): PaymentCaptureValue => ({
  paymentMethodId: null,
  reference: null,
  payerBank: null,
  paidOn: todayIso(),
  payerPhone: null,
  payerId: null,
  payerAccount: null,
  amountUsd: null,
  files: [],
});

/** Max bill photos for Efectivo Divisa. */
const MAX_FILES = 5;
/** Lenient email shape (payer account looks like an email). */
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reusable payment-capture block (method + account details + reference + payer
 * bank + receipt), shared by every cobro in the drivers feature: the registration
 * wizard and the enroll / renewal / external-payment modals. Two-column layout on
 * web. It owns the payment-methods lookup and the file validation, exposing the
 * captured value through `[(value)]` and rejected-file messages through `fileError`.
 */
@Component({
  selector: 'app-payment-capture',
  imports: [FormsModule, Select, DatePicker, ...INPUT_FILTERS],
  templateUrl: './payment-capture.html',
})
export class PaymentCapture {
  private readonly paymentMethodsApi = inject(PaymentMethodsApi);

  readonly nationalIdOptions = NATIONAL_ID_OPTIONS;
  readonly today = todayIso();

  // Composite payer fields (Pago Móvil): kept local, composed into the value.
  payerIdType: NationalIdType = 'V';
  payerIdNumber = '';
  /** Full local phone as the user types it: 11 digits "04121234567". */
  payerPhoneNumber = '';

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
    if (!method || v.files.length === 0 || !v.paidOn) return false;
    // Efectivo Divisa: amount + bill photo(s); no reference/bank/payer data.
    if (method.type === 'cash_usd') {
      const amount = Number(v.amountUsd);
      return !!v.amountUsd && Number.isFinite(amount) && amount > 0;
    }
    if (!v.reference?.trim()) return false;
    if ((method.type === 'bank_transfer' || method.type === 'pago_movil') && !v.payerBank) return false;
    // Pago Móvil: the payer's phone (E.164) and document must be complete.
    if (method.type === 'pago_movil' && (!v.payerPhone || !v.payerId)) return false;
    // Zelle / Binance: the payer's email or name is required (email must be valid).
    if (method.type === 'zelle' || method.type === 'binance') {
      const acct = v.payerAccount?.trim();
      if (!acct) return false;
      if (acct.includes('@') && !EMAIL_LIKE.test(acct)) return false;
    }
    return true;
  });

  /** Type of the selected method, or null. Drives the Pago-Móvil payer fields. */
  readonly selectedMethodType = computed<string | null>(() => {
    const method = this.paymentMethods().find((m) => m.id === this.value().paymentMethodId);
    return method?.type ?? null;
  });

  /** Whether the selected method is Efectivo Divisa (amount + up to 5 bill photos). */
  readonly isCash = computed<boolean>(() => this.selectedMethodType() === 'cash_usd');

  /** Whether the payer phone/id fields apply (Pago Móvil only). */
  readonly needsPayerDetails = computed<boolean>(() => this.selectedMethodType() === 'pago_movil');

  /** Whether the payer bank (banco emisor) applies: only the local-bank methods. */
  readonly needsPayerBank = computed<boolean>(() => {
    const type = this.selectedMethodType();
    return type === 'bank_transfer' || type === 'pago_movil';
  });

  /** Whether the payer account (email/name) applies: Zelle / Binance. */
  readonly needsPayerAccount = computed<boolean>(() => {
    const type = this.selectedMethodType();
    return type === 'zelle' || type === 'binance';
  });

  /** Human name of the selected method (for a payment summary card). Null if none. */
  readonly selectedMethodName = computed<string | null>(() => {
    const method = this.paymentMethods().find((m) => m.id === this.value().paymentMethodId);
    return method?.name ?? null;
  });

  /** Readable label of the payer bank (transfer / pago móvil), or null. */
  readonly payerBankLabel = computed<string | null>(() => {
    const bank = this.value().payerBank;
    if (!bank) return null;
    return this.bankOptions.find((b) => b.value === bank)?.label ?? bank;
  });

  setMethod(id: number | null): void {
    const type = this.paymentMethods().find((m) => m.id === id)?.type;
    // Clear fields that don't apply to the new method so nothing stale is
    // stamped: payer bank (non-local), Pago-Móvil payer id/phone, Zelle/Binance account.
    const clearsBank = type !== 'bank_transfer' && type !== 'pago_movil';
    const clearsPayer = type !== 'pago_movil';
    const clearsAccount = type !== 'zelle' && type !== 'binance';
    if (clearsPayer) {
      this.payerIdNumber = '';
      this.payerPhoneNumber = '';
    }
    this.value.update((v) => ({
      ...v,
      paymentMethodId: id,
      files: [], // receipts differ per method (1 vs up to 5); start clean
      ...(type === 'cash_usd' ? {} : { amountUsd: null }),
      ...(clearsBank ? { payerBank: null } : {}),
      ...(clearsPayer ? { payerPhone: null, payerId: null } : {}),
      ...(clearsAccount ? { payerAccount: null } : {}),
    }));
  }

  setReference(reference: string): void {
    this.value.update((v) => ({ ...v, reference: reference.trim() || null }));
  }

  setBank(bank: string | null): void {
    this.value.update((v) => ({ ...v, payerBank: bank }));
  }

  setPaidOn(date: string): void {
    this.value.update((v) => ({ ...v, paidOn: date }));
  }

  setPayerAccount(account: string): void {
    this.value.update((v) => ({ ...v, payerAccount: account.trim() || null }));
  }

  /** Composes the payer's document into the canonical "V-12345678" form. */
  setPayerId(): void {
    const digits = this.payerIdNumber.replace(/\D/g, '');
    const composed = digits.length >= 5 && digits.length <= 9 ? `${this.payerIdType}-${digits}` : null;
    this.value.update((v) => ({ ...v, payerId: composed }));
  }

  /**
   * Composes the payer's phone into E.164. The user types the full local number
   * (11 digits, "04121234567"); a valid one drops the leading 0 → +58 + 10 digits.
   */
  setPayerPhone(): void {
    const local = this.payerPhoneNumber.replace(/\D/g, '');
    const composed = /^0\d{10}$/.test(local) ? `+58${local.slice(1)}` : null;
    this.value.update((v) => ({ ...v, payerPhone: composed }));
  }

  setAmount(amount: string): void {
    this.value.update((v) => ({ ...v, amountUsd: amount.trim() || null }));
  }

  /** Adds receipt(s): replaces the single one for standard methods; appends up
   *  to 5 bill photos (JPG/PNG) for Efectivo Divisa. */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length === 0) return;
    const cash = this.isCash();
    const room = (cash ? MAX_FILES : 1) - (cash ? this.value().files.length : 0);
    const accepted: File[] = [];
    for (const f of picked.slice(0, Math.max(room, 0))) {
      const problem = validateFile(f);
      if (problem) {
        this.fileError.emit(problem);
        continue;
      }
      if (cash && f.type !== 'image/jpeg' && f.type !== 'image/png') {
        this.fileError.emit('Las fotos de billetes deben ser JPG o PNG.');
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    this.fileError.emit(null);
    this.value.update((v) => ({ ...v, files: cash ? [...v.files, ...accepted] : accepted }));
  }

  /** Removes one receipt by index and resets the native input. */
  removeFile(index: number): void {
    this.value.update((v) => ({ ...v, files: v.files.filter((_, i) => i !== index) }));
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }
}
