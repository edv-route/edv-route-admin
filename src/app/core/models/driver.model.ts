export type DriverStatus =
  | 'pending'
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
  subscription: DriverSubscriptionSummary | null;
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
  status: 'valid' | 'expired' | 'rejected';
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
    /** Debt cap (weeks) before penalization — for the "suspension imminent" warning. */
    capWeeks: number;
    charges: {
      id: string;
      kind: 'period' | 'penalty';
      amountUsd: string;
      status: string;
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
  } | null;
  /** v9: the most recent submission if it was REJECTED (drives the rejection message). */
  rejectedSubmission: {
    rejectionReason: string | null;
    reviewedAt: string | null;
  } | null;
}

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
  paused: 'Pausado',
  overdue: 'En mora',
  penalized: 'Penalizado',
};
