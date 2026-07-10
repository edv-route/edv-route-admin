import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import { VehicleTypesApi } from './vehicle-types.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: VehicleType } | null;

@Component({
  selector: 'app-vehicle-types',
  imports: [FormsModule, DatePipe],
  templateUrl: './vehicle-types.html',
})
export class VehicleTypes {
  private readonly api = inject(VehicleTypesApi);

  readonly items = signal<VehicleType[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modal = signal<ModalState>(null);
  readonly deleteTarget = signal<VehicleType | null>(null);

  name = '';

  constructor() {
    this.load();
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
    this.name = '';
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: VehicleType): void {
    this.name = item.name;
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

    const request =
      state.mode === 'create'
        ? this.api.create(this.name)
        : this.api.update(state.item.id, { name: this.name });

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

  toggleActive(item: VehicleType): void {
    this.api.update(item.id, { active: !item.active }).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) => this.error.set(this.messageOf(err)),
    });
  }

  confirmDelete(item: VehicleType): void {
    this.error.set(null);
    this.deleteTarget.set(item);
  }

  doDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.saving()) return;
    this.saving.set(true);

    this.api.delete(target.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.error.set(this.messageOf(err));
      },
    });
  }

  private messageOf(err: HttpErrorResponse): string {
    return (
      (err.error as { message?: string } | null)?.message ??
      'Error de conexión con la API'
    );
  }
}
