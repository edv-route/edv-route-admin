/**
 * Payment submission (v9): a payment sent by a driver (or an admin on his
 * behalf) that stays `pending` until an admin approves it (debt settled / weeks
 * prepaid, invoice emitted) or rejects it (trace kept, driver told to resend).
 */
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'reverted';
export type SubmissionPurpose = 'debt' | 'advance' | 'enroll' | 'change_plan';

export interface SubmissionListItem {
  id: string;
  /** Continuous receipt number (the "N° de pago"). */
  submissionNumber: string;
  purpose: string;
  driverId: string;
  driverName: string;
  status: SubmissionStatus;
  amountUsd: string;
  paymentMethodName: string | null;
  paidOn: string | null;
  source: string;
  createdAt: string;
  reviewedAt: string | null;
  fileCount: number;
}

/** A receipt/bill image resolved to a short-lived signed URL. */
export interface SubmissionFileView {
  id: string;
  position: number;
  url: string;
}

export interface SubmissionItem {
  label: string;
  amountUsd: string;
  /** N° of the invoice this line bills (null while the receipt is pending). */
  invoiceNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface SubmissionDetail extends SubmissionListItem {
  purpose: string;
  paymentReference: string | null;
  payerBank: string | null;
  payerPhone: string | null;
  payerId: string | null;
  payerAccount: string | null;
  note: string | null;
  rejectionReason: string | null;
  reviewedByName: string | null;
  /** Reversal trace (refund/correction), when the receipt was reverted. */
  reversalType: string | null;
  reversalReason: string | null;
  revertedByName: string | null;
  revertedAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** What the payment covers (breakdown). */
  items: SubmissionItem[];
  files: SubmissionFileView[];
}

export const SUBMISSION_PURPOSE_LABELS: Record<string, string> = {
  debt: 'Pago de deuda',
  advance: 'Adelanto de tarifa',
  enroll: 'Alta: membresía + tarifa',
};

export interface SubmissionList {
  items: SubmissionListItem[];
  total: number;
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  reverted: 'Revertido',
};
