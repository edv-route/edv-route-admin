import { Component, inject, signal } from '@angular/core';
import { BusyDirective } from '../../shared/directives/busy.directive';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { concatMap, of } from 'rxjs';
import { INPUT_FILTERS } from '../../shared/directives/input-filters';
import type { Admin } from '../../core/models/admin.model';
import { AuthService } from '../../core/services/auth.service';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { AdminsApi } from './admins.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Admin } | null;

@Component({
  selector: 'app-admins',
  imports: [FormsModule, DatePipe, ...INPUT_FILTERS, SkeletonRows, BusyDirective],
  templateUrl: './admins.html',
})
export class Admins {
  private readonly api = inject(AdminsApi);
  private readonly auth = inject(AuthService);

  readonly items = signal<Admin[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modal = signal<ModalState>(null);

  // Form model (create + edit share it; password is optional on edit)
  username = '';
  fullName = '';
  email = '';
  password = '';

  constructor() {
    this.load();
  }

  get currentAdminId(): string | null {
    return this.auth.currentAdmin()?.id ?? null;
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  openCreate(): void {
    this.username = '';
    this.fullName = '';
    this.email = '';
    this.password = '';
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: Admin): void {
    this.username = item.username;
    this.fullName = item.fullName;
    this.email = item.email ?? '';
    this.password = '';
    this.error.set(null);
    this.modal.set({ mode: 'edit', item });
  }

  closeModal(): void {
    this.modal.set(null);
  }

  save(): void {
    const state = this.modal();
    if (!state || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const email = this.email.trim() === '' ? null : this.email.trim();

    const request =
      state.mode === 'create'
        ? this.api.create({
            username: this.username,
            fullName: this.fullName,
            email,
            password: this.password,
          })
        : this.api
            .update(state.item.id, { fullName: this.fullName, email })
            .pipe(
              // Optional password change piggybacks on the same save action
              concatMap((admin) =>
                this.password.trim() !== ''
                  ? this.api.updatePassword(state.item.id, this.password)
                  : of(admin),
              ),
            );

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modal.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  toggleStatus(item: Admin): void {
    const status = item.status === 'active' ? 'suspended' : 'active';
    this.api.update(item.id, { status }).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) => this.error.set(this.messageOf(err)),
    });
  }

  private messageOf(err: HttpErrorResponse): string {
    return (
      (err.error as { message?: string } | null)?.message ??
      'Error de conexión con la API'
    );
  }
}
