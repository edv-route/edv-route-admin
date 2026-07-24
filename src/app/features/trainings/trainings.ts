import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DriverListItem } from '../../core/models/driver.model';
import {
  ATTENDEE_STATUS_LABELS,
  TRAINING_STATUS_LABELS,
  type TrainingDetail,
  type TrainingRecord,
  type TrainingStatus,
} from '../../core/models/training.model';
import { DriversApi } from '../drivers/drivers.api';
import { TrainingsApi } from './trainings.api';

const PAGE_SIZE = 20;

type ModalState = { mode: 'create' } | { mode: 'edit'; item: TrainingRecord } | null;

/** ISO string -> value accepted by <input type="datetime-local"> (local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-trainings',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './trainings.html',
})
export class Trainings {
  private readonly api = inject(TrainingsApi);
  private readonly driversApi = inject(DriversApi);

  readonly statusLabels = TRAINING_STATUS_LABELS;
  readonly attendeeLabels = ATTENDEE_STATUS_LABELS;

  readonly items = signal<TrainingRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly statusFilter = signal<TrainingStatus | ''>('');
  readonly modal = signal<ModalState>(null);
  readonly selected = signal<TrainingDetail | null>(null);
  readonly confirmAction = signal<'cancelled' | 'completed' | null>(null);
  readonly driverResults = signal<DriverListItem[]>([]);

  // Modal form fields
  title = '';
  description = '';
  location = '';
  startsAt = '';
  endsAt = '';
  capacity = '';

  driverSearch = '';

  readonly pageSize = PAGE_SIZE;

  constructor() {
    this.load();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({
        ...(this.statusFilter() ? { status: this.statusFilter() } : {}),
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
          this.error.set(this.messageOf(err));
        },
      });
  }

  setStatus(status: TrainingStatus | ''): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }

  /** Fill percentage for the capacity bar (0 when there is no cap set). */
  capacityPct(enrolled: number, capacity: number | null): number {
    if (!capacity || capacity <= 0) return 0;
    return Math.min(100, Math.round((enrolled / capacity) * 100));
  }

  /** A full training gets a red bar; otherwise brand red. */
  isFull(enrolled: number, capacity: number | null): boolean {
    return capacity !== null && enrolled >= capacity;
  }

  select(item: TrainingRecord): void {
    this.error.set(null);
    this.driverSearch = '';
    this.driverResults.set([]);
    this.api.detail(item.id).subscribe((detail) => this.selected.set(detail));
  }

  closeDetail(): void {
    this.selected.set(null);
  }

  // --- create / edit modal ---

  openCreate(): void {
    this.title = '';
    this.description = '';
    this.location = '';
    this.startsAt = '';
    this.endsAt = '';
    this.capacity = '';
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: TrainingRecord): void {
    this.title = item.title;
    this.description = item.description ?? '';
    this.location = item.location ?? '';
    this.startsAt = toLocalInput(item.startsAt);
    this.endsAt = toLocalInput(item.endsAt);
    this.capacity = item.capacity === null ? '' : String(item.capacity);
    this.error.set(null);
    this.modal.set({ mode: 'edit', item });
  }

  closeModal(): void {
    this.modal.set(null);
  }

  save(): void {
    const state = this.modal();
    if (!state || this.saving() || !this.startsAt) return;
    this.saving.set(true);
    this.error.set(null);

    const payload = {
      title: this.title,
      description: this.description.trim() === '' ? null : this.description.trim(),
      location: this.location.trim() === '' ? null : this.location.trim(),
      startsAt: new Date(this.startsAt).toISOString(),
      endsAt: this.endsAt ? new Date(this.endsAt).toISOString() : null,
      capacity: this.capacity === '' ? null : Number(this.capacity),
    };

    const request =
      state.mode === 'create' ? this.api.create(payload) : this.api.update(state.item.id, payload);

    request.subscribe({
      next: (detail) => {
        this.saving.set(false);
        this.modal.set(null);
        this.selected.set(detail);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  // --- cancel / complete ---

  requestStatus(action: 'cancelled' | 'completed'): void {
    this.confirmAction.set(action);
  }

  applyStatus(): void {
    const detail = this.selected();
    const action = this.confirmAction();
    if (!detail || !action || this.saving()) return;
    this.saving.set(true);

    this.api.setStatus(detail.id, action).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.confirmAction.set(null);
        this.selected.set(updated);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.confirmAction.set(null);
        this.error.set(this.messageOf(err));
      },
    });
  }

  // --- attendees ---

  searchDrivers(): void {
    const term = this.driverSearch.trim();
    if (term.length < 2) {
      this.driverResults.set([]);
      return;
    }
    this.driversApi
      .list({ status: 'approved', search: term, page: 1, limit: 5 })
      .subscribe((result) => this.driverResults.set(result.items));
  }

  enroll(driver: DriverListItem): void {
    const detail = this.selected();
    if (!detail || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    this.api.enroll(detail.id, driver.userId).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.driverSearch = '';
        this.driverResults.set([]);
        this.selected.set(updated);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  setAttendee(attendeeId: string, status: 'attended' | 'absent' | 'cancelled'): void {
    const detail = this.selected();
    if (!detail || this.saving()) return;
    this.saving.set(true);

    this.api.setAttendeeStatus(detail.id, attendeeId, status).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.selected.set(updated);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  private messageOf(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
