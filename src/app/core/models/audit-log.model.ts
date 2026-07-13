export type AuditActorType = 'admin' | 'user' | 'system';

export interface AuditLogItem {
  id: string;
  eventType: string;
  entity: string;
  entityId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  actorType: AuditActorType;
  actorName: string | null;
  actorUsername: string | null;
  driverId: string | null;
  driverName: string | null;
}

export interface AuditLogList {
  items: AuditLogItem[];
  total: number;
}

export interface AuditLogActor {
  id: string;
  fullName: string;
  username: string;
}

/** Distinct values present in the log; the API derives them, nothing is hardcoded. */
export interface AuditLogFacets {
  eventTypes: string[];
  entities: string[];
  actors: AuditLogActor[];
}

/** UI labels for known event types; unknown ones fall back to the raw key. */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  'driver.created': 'Afiliado creado',
  'driver.updated': 'Afiliado actualizado',
  'driver.enrolled': 'Pagos de afiliación',
  'driver.approved': 'Afiliado aprobado',
  'driver.rejected': 'Afiliado rechazado',
  'vehicle.registered': 'Vehículo registrado',
  'document.registered': 'Documento registrado',
  'subscription.renewed': 'Tarifa renovada',
  'subscription.period_advanced': 'Adelanto consumido',
  'subscription.expired': 'Tarifa vencida',
  'vehicle_type.created': 'Tipo de vehículo creado',
  'vehicle_type.updated': 'Tipo de vehículo editado',
  'vehicle_type.deleted': 'Tipo de vehículo eliminado',
  'requirement.created': 'Requerimiento creado',
  'requirement.updated': 'Requerimiento editado',
  'requirement.deleted': 'Requerimiento eliminado',
  'benefit.created': 'Beneficio creado',
  'benefit.updated': 'Beneficio editado',
  'benefit.deleted': 'Beneficio eliminado',
  'admin.created': 'Administrador creado',
  'admin.updated': 'Administrador editado',
  'admin.password_changed': 'Contraseña cambiada',
  'setting.updated': 'Configuración actualizada',
  'membership.created': 'Membresía creada',
  'membership.updated': 'Membresía editada',
  'membership.versioned': 'Membresía versionada',
  'plan.created': 'Tarifa creada',
  'plan.updated': 'Tarifa editada',
  'plan.versioned': 'Tarifa versionada',
  'plan.archived': 'Tarifa archivada',
  'plan.reactivated': 'Tarifa reactivada',
};

/** UI labels for the entities a log entry can point at. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  drivers: 'Afiliado',
  driver_subscriptions: 'Suscripción',
  vehicle_types: 'Tipo de vehículo',
  requirements: 'Requerimiento',
  benefits: 'Beneficio',
  admins: 'Administrador',
  app_settings: 'Configuración',
  memberships: 'Membresía',
  subscription_plans: 'Tarifa',
};
