import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import type { Requirement, RequirementAppliesTo } from '../../core/models/requirement.model';
import { Select, type SelectOption } from '../../shared/components/select';
import { RequirementsApi } from './requirements.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Requirement } | null;

@Component({
  selector: 'app-requirements',
  imports: [FormsModule, Select],
  templateUrl: './requirements.html',
})
export class Requirements {
  private readonly api = inject(RequirementsApi);

  readonly appliesToOptions: SelectOption[] = [
    { value: 'driver', label: 'Chofer' },
    { value: 'vehicle', label: 'Vehículo' },
  ];

  readonly items = signal<Requirement[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modal = signal<ModalState>(null);
  readonly deleteTarget = signal<Requirement | null>(null);

  name = '';
  description = '';
  appliesTo: RequirementAppliesTo = 'driver';
  isRequired = false;

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
    this.description = '';
    this.appliesTo = 'driver';
    this.isRequired = false;
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: Requirement): void {
    this.name = item.name;
    this.description = item.description ?? '';
    this.appliesTo = item.appliesTo;
    this.isRequired = item.isRequired;
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

    const payload = {
      name: this.name,
      description: this.description.trim() === '' ? null : this.description.trim(),
      appliesTo: this.appliesTo,
      isRequired: this.isRequired,
    };

    const request =
      state.mode === 'create'
        ? this.api.create(payload)
        : this.api.update(state.item.id, payload);

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

  toggleActive(item: Requirement): void {
    this.api.update(item.id, { active: !item.active }).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) => this.error.set(this.messageOf(err)),
    });
  }

  confirmDelete(item: Requirement): void {
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
