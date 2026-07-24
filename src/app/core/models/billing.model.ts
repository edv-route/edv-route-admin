export type InvoiceStatus = 'issued' | 'voided';
export type PaymentKind = 'membership' | 'subscription';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  totalUsd: string;
  status: InvoiceStatus;
  issuedAt: string;
  voidedAt: string | null;
  driverId: string;
  driverName: string;
  voidedByName: string | null;
  /** Payment details (v8, Pieza 2). */
  paymentMethodName: string | null;
  paymentReference: string | null;
  payerBank: string | null;
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
