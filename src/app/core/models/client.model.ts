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
  /**
   * The office-verified one when the person is also an affiliate, else the
   * self-declared one; null only on accounts registered before the cédula
   * became mandatory (2026-08-31).
   */
  nationalId: string | null;
  /** Whether this person ALSO drives for the gremio. */
  isAffiliate: boolean;
  createdAt: string;
  /** Profile photo as a SIGNED URL (expires); null = show initials instead. */
  photoUrl: string | null;
}

export interface ClientList {
  items: ClientListItem[];
  total: number;
}

/** The detail card: everything the list shows plus the person's extras. */
export interface ClientDetail extends ClientListItem {
  address: string | null;
  birthDate: string | null;
  /** When he accepted the privacy policy at registration; null on legacy rows. */
  acceptedPrivacyAt: string | null;
  /** Registration channel (clients self-register from the app). */
  source: 'app';
}
