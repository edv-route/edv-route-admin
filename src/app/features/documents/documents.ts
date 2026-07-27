import { Component, computed, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DOCUMENT_STATUS_LABELS,
  type DocumentListItem,
  type DocumentStatus,
} from '../../core/models/document.model';
import type { Requirement } from '../../core/models/requirement.model';
import { Select, type SelectOption } from '../../shared/components/select';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { RequirementsApi } from '../requirements/requirements.api';
import { DocumentsApi } from './documents.api';

const PAGE_SIZE = 20;
const WARNING_DAYS = 30;

@Component({
  selector: 'app-documents',
  imports: [FormsModule, DatePipe, RouterLink, Select, FileViewer],
  templateUrl: './documents.html',
})
export class Documents {
  private readonly api = inject(DocumentsApi);

  readonly statusLabels = DOCUMENT_STATUS_LABELS;
  readonly items = signal<DocumentListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly requirements = signal<Requirement[]>([]);
  readonly statusFilter = signal<DocumentStatus | ''>('');
  readonly expiringOnly = signal(false);
  /** File shown in the modal viewer (null = closed). */
  readonly viewer = signal<FileViewerState | null>(null);

  /** Requirement filter options for app-select ('' = all). */
  readonly requirementOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos los requerimientos' },
    ...this.requirements().map((r) => ({
      value: String(r.id),
      label: `${r.name} (${r.appliesTo === 'driver' ? 'chofer' : 'vehículo'})`,
    })),
  ]);

  requirementId = '';
  search = '';

  readonly pageSize = PAGE_SIZE;
  readonly warningDays = WARNING_DAYS;

  constructor(requirementsApi: RequirementsApi) {
    requirementsApi.list().subscribe((reqs) => this.requirements.set(reqs));
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  get hasActiveFilters(): boolean {
    return !!(this.statusFilter() || this.expiringOnly() || this.requirementId || this.search);
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({
        ...(this.statusFilter() ? { status: this.statusFilter() } : {}),
        ...(this.requirementId ? { requirementId: Number(this.requirementId) } : {}),
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        ...(this.expiringOnly() ? { expiringDays: WARNING_DAYS } : {}),
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

  setStatus(status: DocumentStatus | ''): void {
    this.statusFilter.set(status);
    // "Expiring" is a subset of valid documents; a status filter replaces it.
    if (status) this.expiringOnly.set(false);
    this.applyFilters();
  }

  toggleExpiring(): void {
    this.expiringOnly.set(!this.expiringOnly());
    if (this.expiringOnly()) this.statusFilter.set('');
    this.applyFilters();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.statusFilter.set('');
    this.expiringOnly.set(false);
    this.requirementId = '';
    this.search = '';
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }

  /** Opens the private file in the modal viewer through a short-lived signed URL. */
  openFile(item: DocumentListItem): void {
    const title = item.requirementName;
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.api.fileUrl(item.id).subscribe({
      next: ({ url }) => this.viewer.set({ title, url, loading: false, error: null }),
      error: (err: HttpErrorResponse) =>
        this.viewer.set({
          title,
          url: null,
          loading: false,
          error:
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        }),
    });
  }

  /** Valid document whose expiry falls within the warning window. */
  isExpiringSoon(item: DocumentListItem): boolean {
    if (item.status !== 'valid' || !item.expiresAt) return false;
    const limit = new Date();
    limit.setDate(limit.getDate() + WARNING_DAYS);
    return new Date(item.expiresAt) <= limit;
  }
}
