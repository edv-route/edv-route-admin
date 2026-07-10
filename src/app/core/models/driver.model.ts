export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

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
}

export interface DriverList {
  items: DriverListItem[];
  total: number;
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

export interface DriverDetail extends DriverListItem {
  isAvailable: boolean;
  contractUrl: string | null;
  vehicles: DriverVehicle[];
  documents: DriverDocument[];
  membershipPayment: { id: string; amountUsd: string; status: string; paidAt: string | null } | null;
  subscription: {
    id: string;
    planId: number;
    planName: string;
    status: string;
    billingPeriod: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    paidPeriods: number;
  } | null;
}

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
};
