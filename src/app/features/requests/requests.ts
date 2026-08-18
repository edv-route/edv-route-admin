import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DriverListItem } from '../../core/models/driver.model';
import { DriversApi } from '../drivers/drivers.api';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { Pagination } from '../../shared/components/pagination';
import { Avatar } from '../../shared/components/avatar';
import { Select, type SelectOption } from '../../shared/components/select';

const PAGE_SIZE = 10;

/** Which app solicitudes the list shows: in-review vs kept-on-file rejected. */
type RequestStatus = 'applicant' | 'rejected';

/**
 * Solicitudes list (solicitudes-app): app self-registrations awaiting review
 * (`source=app & status=applicant`), kept apart from the affiliate padrón so the
 * system is not flooded with pending rows. The admin reviews each one (documents
 * + vehicles) and approves/rejects it from the detail. Reuses `DriversApi.list`.
 */
@Component({
  selector: 'app-requests',
  imports: [FormsModule, DatePipe, RouterLink, SkeletonRows, Pagination, Select, Avatar],
  templateUrl: './requests.html',
})
export class Requests {
  private readonly api = inject(DriversApi);

  readonly items = signal<DriverListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  search = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Status filter: `applicant` (in review) or `rejected` (kept on file). */
  statusFilter: RequestStatus = 'applicant';
  readonly statusOptions: SelectOption[] = [
    { value: 'applicant', label: 'En revisión' },
    { value: 'rejected', label: 'Rechazadas' },
  ];

  readonly pageSize = PAGE_SIZE;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({
        source: 'app',
        status: this.statusFilter,
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

  onSearch(): void {
    this.page.set(1);
    this.load();
  }

  /** Switches between in-review and rejected solicitudes. */
  onStatusChange(): void {
    this.page.set(1);
    this.load();
  }

  /** Live search: reloads 300ms after the last keystroke (Enter still applies now). */
  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.onSearch(), 300);
  }

  goToPage(page: number): void {
    const totalPages = Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
    if (page < 1 || page > totalPages) return;
    this.page.set(page);
    this.load();
  }

}
