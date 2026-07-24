import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DRIVER_STATUS_LABELS,
  type DriverListItem,
  type DriverStatus,
} from '../../core/models/driver.model';
import { DriversApi } from './drivers.api';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-drivers',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './drivers.html',
})
export class Drivers {
  private readonly api = inject(DriversApi);

  readonly statusLabels = DRIVER_STATUS_LABELS;
  readonly items = signal<DriverListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<DriverStatus | ''>('');

  search = '';

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
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
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

  setStatus(status: DriverStatus | ''): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  onSearch(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }

  /** Initials for the avatar chip in the name cell (Pro table pattern). */
  initials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }
}
