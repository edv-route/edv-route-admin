/**
 * Affiliate location (proposal:
 * edv-route-backend/docs/proposals/ubicacion-afiliados/fase-4-mapa.md).
 */

/**
 * How present an affiliate is. The SERVER decides this, deriving it from the
 * configured reporting interval — the panel must never recompute it from
 * minutes, or the legend would start contradicting the pins the day the pace
 * changes.
 */
export type Presence = 'online' | 'delayed' | 'offline';

/** One affiliate as the live map shows him. */
export interface LiveLocation {
  userId: string;
  fullName: string;
  nationalId: string | null;
  /** Already a signed URL, or null when it could not be signed. */
  photoUrl: string | null;
  status: string;
  lat: number;
  lon: number;
  /** Error margin in metres, or null when the phone did not report it. */
  accuracyM: number | null;
  lastLocationAt: string;
  ageSeconds: number;
  presence: Presence;
}

export interface LiveLocationResult {
  items: LiveLocation[];
  total: number;
  /** Reporting pace in force. The map times its own refresh against it. */
  intervalSeconds: number;
  /** Server thresholds, so the legend always matches the pins. */
  onlineWithinSeconds: number;
  delayedWithinSeconds: number;
}

/** One point of a day's trail. */
export interface TrailPoint {
  lat: number;
  lon: number;
  accuracyM: number | null;
  /** When the PHONE took it. The trail is drawn in this order. */
  recordedAt: string;
  /** When it reached the server. */
  createdAt: string;
  /** Seconds it sat in the phone queue: hours mean it was out of signal. */
  delaySeconds: number;
}

export interface TrailResult {
  points: TrailPoint[];
  summary: {
    count: number;
    firstAt: string | null;
    lastAt: string | null;
    maxDelaySeconds: number | null;
  };
  /** True when the server capped the point list; `summary.count` is still the truth. */
  truncated: boolean;
}
