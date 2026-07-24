export type TrainingStatus = 'scheduled' | 'cancelled' | 'completed';
export type AttendeeStatus = 'registered' | 'attended' | 'absent' | 'cancelled';

export interface TrainingRecord {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  /** null = unlimited */
  capacity: number | null;
  status: TrainingStatus;
  enrolledCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingAttendee {
  id: string;
  driverId: string;
  driverName: string;
  nationalId: string | null;
  status: AttendeeStatus;
  createdAt: string;
}

export interface TrainingDetail extends TrainingRecord {
  attendees: TrainingAttendee[];
}

export interface TrainingList {
  items: TrainingRecord[];
  total: number;
}

export interface TrainingInput {
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
}

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  scheduled: 'Programada',
  cancelled: 'Cancelada',
  completed: 'Completada',
};

export const ATTENDEE_STATUS_LABELS: Record<AttendeeStatus, string> = {
  registered: 'Inscrito',
  attended: 'Asistió',
  absent: 'Ausente',
  cancelled: 'Cancelado',
};
