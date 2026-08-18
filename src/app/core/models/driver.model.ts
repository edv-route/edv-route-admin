export type DriverStatus =
  /** App solicitud in review — not an affiliate yet (solicitudes-app, 2026-08-11). */
  | 'applicant'
  | 'pending'
  /** Approved with the "start next Monday" option: decision made but not operative
   *  yet; the activation job flips him to `approved` on that Monday (2026-08-09). */
  | 'scheduled'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'paused'
  /** Debt engine (v8): in arrears but still operating, up to the cap. */
  | 'overdue'
  /** Debt engine (v8): went past the debt cap, does not operate. */
  | 'penalized';

export interface DriverSubscriptionSummary {
  status: 'active' | 'scheduled' | 'pending_payment' | 'expired';
  currentPeriodEnd: string | null;
  dueSoon: boolean;
}

export interface DriverListItem {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  status: DriverStatus;
  source: 'app' | 'admin';
  registrationStep: number | null;
  createdAt: string;
  /** When the tariff start was set; null = approved but not started yet (no opera). */
  tariffStartSetAt: string | null;
  subscription: DriverSubscriptionSummary | null;
  /** Outstanding debt (membership + owed tariff weeks), USD string ("0.00" if none). */
  debtUsd: string;
  /** A payment (v9 submission) is awaiting admin review. */
  hasPendingSubmission: boolean;
  /** Profile photo as a SIGNED URL (expires); null = show initials instead. */
  photoUrl: string | null;
}

export interface DriverList {
  items: DriverListItem[];
  total: number;
}

export interface VehicleImage {
  id: string;
  position: number;
}

export interface DriverVehicle {
  id: string;
  vehicleTypeId: number | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  plate: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  /** Reason shown to the applicant when the vehicle is rejected (solicitudes-app). */
  rejectionReason: string | null;
  images: VehicleImage[];
}

export interface DriverDocument {
  id: string;
  requirementId: number;
  requirementName: string;
  appliesTo: 'driver' | 'vehicle';
  vehicleId: string | null;
  fileUrl: string | null;
  expiresAt: string | null;
  /** Validity axis (inert since solicitudes-app). */
  status: 'valid' | 'expired' | 'rejected';
  /** Review axis (solicitudes-app): the admin approves/rejects each document. */
  approvalStatus: 'pending' | 'approved' | 'rejected';
  /** Reason shown to the applicant when the document is rejected. */
  rejectionReason: string | null;
}

export interface DriverDetail extends Omit<DriverListItem, 'subscription'> {
  firstName: string;
  middleName: string | null;
  lastName: string;
  secondLastName: string | null;
  birthDate: string | null;
  address: string | null;
  /** The app password itself never leaves the backend. */
  hasAppPassword: boolean;
  isAvailable: boolean;
  contractUrl: string | null;
  /** When the tariff start was set (solicitudes-app); null = not set yet → the
   *  profile highlights the tariff card and offers "Establecer inicio". */
  tariffStartSetAt: string | null;
  /** The driver's "current" vehicle (backend sends it; used to flag it in the UI). */
  currentVehicleId: string | null;
  vehicles: DriverVehicle[];
  documents: DriverDocument[];
  membershipPayment: { id: string; amountUsd: string; status: string; paidAt: string | null } | null;
  /** Benefits of the membership version the driver paid (empty if not a member). */
  benefits: { id: number; name: string; description: string | null }[];
  subscription: {
    id: string;
    planId: number;
    planName: string;
    status: string;
    billingPeriod: string;
    priceUsd: string;
    startedAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    /** End of the LAST prepaid period (advances included) — when coverage runs out. */
    paidUntil: string | null;
    paidPeriods: number;
    /**
     * When the debt engine will EMIT the next weekly charge (the billing Friday
     * before coverage ends). Present only for an active weekly tariff with the
     * engine on; null/absent otherwise (prepaid → the card falls back to paidUntil).
     */
    nextChargeAt?: string | null;
  } | null;
  /**
   * Outstanding debt (v8 debt engine): unpaid weekly charges + penalty.
   * Always present (zeros when nothing is owed). Read-only: settled via renewal
   * or external payment, never registered by hand.
   */
  debt: {
    totalUsd: string;
    weeksOwed: number;
    penaltyCount: number;
    /** Unpaid membership (alta debt), 0 when none — part of totalUsd. */
    membershipDue: string;
    /** Invoice of the pending membership charge (null when none) — lets the profile
     *  tell whether the membership line is covered by a pending payment. */
    membershipInvoiceId: string | null;
    /** Debt cap (weeks) before penalization — for the "suspension imminent" warning. */
    capWeeks: number;
    charges: {
      id: string;
      kind: 'period' | 'penalty';
      amountUsd: string;
      status: string;
      /** Invoice this charge bills — matched against a pending payment's coverage. */
      invoiceId: string | null;
      periodStart: string | null;
      periodEnd: string | null;
    }[];
  };
  /**
   * Next weekly charge already emitted but NOT yet due (Friday 18:00 → Sunday
   * window): the solvent driver's advance-pay prompt. Null when nothing upcoming.
   */
  upcoming: { amountUsd: string; periodStart: string; periodEnd: string } | null;
  /** Programmed plan change waiting for the paid coverage to run out. */
  scheduledPlan: {
    planName: string;
    billingPeriod: string;
    startsAt: string | null;
  } | null;
  /** v9: a payment awaiting admin review (hides the pay button, shows "en revisión"). */
  pendingSubmission: {
    id: string;
    amountUsd: string;
    purpose: string;
    createdAt: string;
    /** Debt invoices this payment covers (partial payment). Null/empty = it covers
     *  the whole debt — the profile then shows a single "en revisión" band. */
    invoiceIds: string[] | null;
  } | null;
  /** All payments under review (most recent first): the profile lists each with
   *  its amount, not just the most recent one. */
  pendingSubmissions: {
    id: string;
    /** Continuous receipt number (the "N° de pago"). */
    submissionNumber: string;
    amountUsd: string;
    purpose: string;
    createdAt: string;
    invoiceIds: string[] | null;
    /** N° of every invoice this payment covers, ascending. */
    invoiceNumbers: string[];
  }[];
  /** How many payments are under review (2026-08-12: multiple allowed). */
  pendingCount: number;
  /** Union of invoice ids covered by ALL pending payments — the debt already
   *  reserved. A new payment may only target invoices NOT in this set. */
  coveredInvoiceIds: string[];
  /** v9: the most recent submission if it was REJECTED (drives the rejection message). */
  rejectedSubmission: {
    rejectionReason: string | null;
    reviewedAt: string | null;
  } | null;
}

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  applicant: 'Solicitud',
  pending: 'Pendiente',
  scheduled: 'Programado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
  paused: 'Pausado',
  overdue: 'En mora',
  penalized: 'Penalizado',
};
