import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_EVENT_LABELS,
  type AuditLogItem,
} from '../../core/models/audit-log.model';
import type { DashboardSummary } from '../../core/models/dashboard.model';
import { AuditLogsApi } from '../audit/audit-logs.api';
import { DashboardApi } from './dashboard.api';

const FEED_SIZE = 8;

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly api = inject(DashboardApi);
  private readonly auditApi = inject(AuditLogsApi);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly feed = signal<AuditLogItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        );
      },
    });
    this.auditApi
      .list({ page: 1, limit: FEED_SIZE })
      .subscribe((result) => this.feed.set(result.items));
  }

  get hasAlerts(): boolean {
    const s = this.summary();
    return !!s && (s.subscriptions.expired > 0 || s.subscriptions.dueSoon > 0 || s.drivers.pending > 0 || s.drivers.suspended > 0);
  }

  eventLabel(eventType: string): string {
    return AUDIT_EVENT_LABELS[eventType] ?? eventType;
  }

  /** Who/what the feed line is about: driver name when resolved, entity otherwise. */
  feedSubject(item: AuditLogItem): string {
    if (item.driverName) return item.driverName;
    const entity = AUDIT_ENTITY_LABELS[item.entity] ?? item.entity;
    const name = item.data?.['name'];
    return typeof name === 'string' ? `${entity} «${name}»` : entity;
  }
}
