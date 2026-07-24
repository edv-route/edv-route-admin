import { Component, inject, output, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import type { Benefit } from '../../core/models/benefit.model';
import { BenefitsApi } from './benefits.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Benefit } | null;

/**
 * Benefits catalog, embedded in the membership screen (they are one section:
 * a benefit only means something granted by a membership version). Emits
 * `changed` so the parent can refresh the benefits it offers per version.
 */
@Component({
  selector: 'app-benefits-catalog',
  imports: [FormsModule],
  templateUrl: './benefits-catalog.html',
})
export class BenefitsCatalog {
  private readonly api = inject(BenefitsApi);

  readonly changed = output<void>();

  readonly items = signal<Benefit[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modal = signal<ModalState>(null);
  readonly deleteTarget = signal<Benefit | null>(null);

  name = '';
  description = '';

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
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: Benefit): void {
    this.name = item.name;
    this.description = item.description ?? '';
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
    };

    const request =
      state.mode === 'create'
        ? this.api.create(payload)
        : this.api.update(state.item.id, payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modal.set(null);
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  toggleActive(item: Benefit): void {
    this.api.update(item.id, { active: !item.active }).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => this.error.set(this.messageOf(err)),
    });
  }

  confirmDelete(item: Benefit): void {
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
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.deleteTarget.set(null);
        this.error.set(this.messageOf(err));
      },
    });
  }

  /** Refreshes the catalog and notifies the parent (membership benefit picker). */
  private reload(): void {
    this.load();
    this.changed.emit();
  }

  private messageOf(err: HttpErrorResponse): string {
    return (
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API'
    );
  }
}
