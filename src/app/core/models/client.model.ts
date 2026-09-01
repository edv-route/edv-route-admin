/** The admin's view of a passenger (sección «Clientes», list-only for now). */

export type ClientStatus = 'active' | 'suspended';

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
};

export interface ClientListItem {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  /** Present only when this person is ALSO an affiliate (lives on `drivers`). */
  nationalId: string | null;
  createdAt: string;
  /** Profile photo as a SIGNED URL (expires); null = show initials instead. */
  photoUrl: string | null;
}

export interface ClientList {
  items: ClientListItem[];
  total: number;
}
