export type DocumentStatus = 'valid' | 'expired' | 'rejected';

export interface DocumentListItem {
  id: string;
  requirementId: number;
  requirementName: string;
  appliesTo: 'driver' | 'vehicle';
  fileUrl: string | null;
  expiresAt: string | null;
  status: DocumentStatus;
  createdAt: string;
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
}

export interface DocumentList {
  items: DocumentListItem[];
  total: number;
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  valid: 'Válido',
  expired: 'Vencido',
  rejected: 'Rechazado',
};
