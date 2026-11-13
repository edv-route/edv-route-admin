/**
 * Identity photos of a PERSON (2026-11-12): selfie + cédula front/back, sent
 * from the app, reviewed here. The same photos serve the affiliate and the
 * passenger side of one person. Mirrors `GET /identity/users/:userId`.
 */
export type IdentityKind = 'selfie' | 'id_front' | 'id_back';
export type IdentityPhotoStatus = 'pending' | 'approved' | 'rejected';

/** missing → rejected → pending → approved: what the person has to DO first. */
export type IdentityStatus = 'missing' | 'rejected' | 'pending' | 'approved';

export interface IdentityPhoto {
  id: string;
  kind: IdentityKind;
  status: IdentityPhotoStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewedByName?: string | null;
  /** Signed link, valid two minutes. */
  url: string | null;
}

export interface IdentityView {
  status: IdentityStatus;
  /** `identity_required_enabled`: whether work already depends on it. */
  required: boolean;
  photos: IdentityPhoto[];
}

export const IDENTITY_KINDS: readonly IdentityKind[] = ['selfie', 'id_front', 'id_back'];

export const IDENTITY_KIND_LABELS: Record<IdentityKind, string> = {
  selfie: 'Foto tipo carnet',
  id_front: 'Cédula · frente',
  id_back: 'Cédula · reverso',
};

/**
 * The usual reasons, one click away; "Otro motivo" opens a free text. The
 * person reads the reason in the notice, so each one says what to fix.
 */
export const IDENTITY_REJECT_REASONS: Record<IdentityKind, readonly string[]> = {
  selfie: ['Está borrosa', 'No se ve bien la cara', 'Tiene lentes o gorra', 'No coincide con la cédula'],
  id_front: ['Está borrosa', 'No se leen los datos', 'Está cortada o incompleta', 'Tiene reflejos'],
  id_back: ['Está borrosa', 'No se lee bien', 'Está cortada o incompleta', 'Tiene reflejos'],
};
