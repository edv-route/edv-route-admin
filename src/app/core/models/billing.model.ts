/**
 * Derived by the API from the invoice's charges: `issued` = emitted but still
 * owed (debt invoice), `paid` = every charge settled, `voided` = annulled.
 */
export type InvoiceStatus = 'issued' | 'paid' | 'voided';
export type PaymentKind = 'membership' | 'subscription';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  totalUsd: string;
  status: InvoiceStatus;
  issuedAt: string;
  /** Settlement date (max paid_at of its charges); null unless fully paid. */
  paidAt: string | null;
  voidedAt: string | null;
  driverId: string;
  driverName: string;
  voidedByName: string | null;
  /** Payment details (v8, Pieza 2). */
  paymentMethodName: string | null;
  paymentReference: string | null;
  payerBank: string | null;
  /** Payer details (2026-07-31): date paid, phone/id (Pago Móvil), email/name (Zelle/Binance). */
  paidOn: string | null;
  payerPhone: string | null;
  payerId: string | null;
  payerAccount: string | null;
  hasProof: boolean;
}

export interface PaymentListItem {
  id: string;
  driverId: string;
  driverName: string;
  kind: PaymentKind;
  concept: string;
  amountUsd: string;
  status: PaymentStatus;
  paidAt: string | null;
  refundedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

/** Single invoice (detail screen) + the v9 submission that produced it, if any. */
export interface InvoiceDetail extends InvoiceListItem {
  submissionId: string | null;
}

export interface InvoiceList {
  items: InvoiceListItem[];
  total: number;
}

export interface PaymentList {
  items: PaymentListItem[];
  total: number;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  issued: 'Emitida',
  paid: 'Pagada',
  voided: 'Anulada',
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  membership: 'Membresía',
  subscription: 'Tarifa',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  refunded: 'Reembolsado',
};
