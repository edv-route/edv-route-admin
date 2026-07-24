import { Component, computed, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_EVENT_LABELS,
  type AuditLogFacets,
  type AuditLogItem,
} from '../../core/models/audit-log.model';
import { DatePicker } from '../../shared/components/date-picker';
import { Select, type SelectOption } from '../../shared/components/select';
import { AuditLogsApi } from './audit-logs.api';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-audit-logs',
  imports: [FormsModule, DatePipe, RouterLink, Select, DatePicker],
  templateUrl: './audit-logs.html',
})
export class AuditLogs {
  private readonly api = inject(AuditLogsApi);

  readonly items = signal<AuditLogItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly facets = signal<AuditLogFacets>({ eventTypes: [], entities: [], actors: [] });
  readonly sourceFilter = signal<'' | 'admin' | 'system'>('');

  /** Filter options for app-select ('' = all), derived from the log facets. */
  readonly eventTypeOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos los eventos' },
    ...this.facets().eventTypes.map((type) => ({ value: type, label: this.eventLabel(type) })),
  ]);
  readonly adminOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos los admins' },
    ...this.facets().actors.map((actor) => ({
      value: actor.id,
      label: `${actor.fullName} (${actor.username})`,
    })),
  ]);

  eventType = '';
  adminId = '';
  from = '';
  to = '';

  readonly pageSize = PAGE_SIZE;

  constructor() {
    this.api.facets().subscribe((facets) => this.facets.set(facets));
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  get hasActiveFilters(): boolean {
    return !!(this.sourceFilter() || this.eventType || this.adminId || this.from || this.to);
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({
        ...(this.eventType ? { eventType: this.eventType } : {}),
        ...(this.sourceFilter() ? { source: this.sourceFilter() as 'admin' | 'system' } : {}),
        ...(this.adminId ? { adminId: this.adminId } : {}),
        ...(this.from ? { from: this.from } : {}),
        ...(this.to ? { to: this.to } : {}),
        page: this.page(),
        limit: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
          );
        },
      });
  }

  setSource(source: '' | 'admin' | 'system'): void {
    this.sourceFilter.set(source);
    // A specific admin only makes sense when admin actions are in scope.
    if (source === 'system') this.adminId = '';
    this.applyFilters();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.sourceFilter.set('');
    this.eventType = '';
    this.adminId = '';
    this.from = '';
    this.to = '';
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }

  eventLabel(eventType: string): string {
    return AUDIT_EVENT_LABELS[eventType] ?? eventType;
  }

  entityLabel(entity: string): string {
    return AUDIT_ENTITY_LABELS[entity] ?? entity;
  }

  eventBadgeClass(eventType: string): string {
    if (
      eventType.endsWith('.approved') ||
      eventType.endsWith('.created') ||
      eventType.endsWith('.reactivated')
    ) {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    }
    if (
      eventType.endsWith('.rejected') ||
      eventType.endsWith('.expired') ||
      eventType.endsWith('.deleted') ||
      eventType.endsWith('.archived')
    ) {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    }
    if (
      eventType.endsWith('.enrolled') ||
      eventType.endsWith('.renewed') ||
      eventType.endsWith('.versioned')
    ) {
      return 'bg-gold-100 text-gold-800';
    }
    return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }

  /** Compact one-line rendering of the JSON payload for the table. */
  detailText(item: AuditLogItem): string {
    if (!item.data) return '';
    return Object.entries(item.data)
      .map(([key, value]) => {
        const rendered = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : String(value);
        return `${key}: ${rendered}`;
      })
      .join(' · ');
  }
}
