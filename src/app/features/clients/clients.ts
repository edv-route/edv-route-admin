import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ClientListItem, ClientStatus } from '../../core/models/client.model';
import { ClientsApi } from './clients.api';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { Pagination } from '../../shared/components/pagination';
import { Avatar } from '../../shared/components/avatar';

const PAGE_SIZE = 10;

/**
 * Passengers list (sección «Clientes», 2026-08-31) — LIST ONLY for now
 * (decision by Luis): no detail card, no row actions. Mirrors the affiliates
 * list chassis (Flowbite Pro users list) so the two read as one panel.
 * Clients self-register from the app, so there is no "Nuevo" button either.
 */
@Component({
  selector: 'app-clients',
  imports: [FormsModule, DatePipe, RouterLink, SkeletonRows, Pagination, Avatar],
  templateUrl: './clients.html',
})
export class Clients {
  private readonly api = inject(ClientsApi);

  readonly items = signal<ClientListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<ClientStatus | ''>('');

  search = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

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

  setStatus(status: ClientStatus | ''): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  onSearch(): void {
    this.page.set(1);
    this.load();
  }

  /** Live search: reloads 300ms after the last keystroke (Enter still applies now). */
  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.onSearch(), 300);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }
}
