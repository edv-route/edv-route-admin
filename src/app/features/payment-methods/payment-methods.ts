import { Component, computed, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Select, type SelectOption } from '../../shared/components/select';
import { INPUT_FILTERS } from '../../shared/directives/input-filters';
import {
  NATIONAL_ID_OPTIONS,
  parseNationalId,
  type NationalIdType,
} from '../drivers/person-form';
import {
  PAYMENT_METHOD_FIELDS,
  PAYMENT_METHOD_TYPE_LABELS,
  paymentFieldError,
  type PaymentMethod,
  type PaymentMethodField,
  type PaymentMethodType,
} from '../../core/models/payment-method.model';
import { PaymentMethodsApi } from './payment-methods.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: PaymentMethod } | null;

@Component({
  selector: 'app-payment-methods',
  imports: [FormsModule, Select, ...INPUT_FILTERS],
  templateUrl: './payment-methods.html',
})
export class PaymentMethods {
  private readonly api = inject(PaymentMethodsApi);

  readonly nationalIdOptions = NATIONAL_ID_OPTIONS;
  /**
   * Local V/E/J + number parts for each `idDocument` field, kept apart from
   * `details` (which stores the composed "V-12345678") so the selected type
   * survives while the number is being typed. Re-seeded from `details` whenever
   * the modal opens or the type changes.
   */
  private idParts: Record<string, { type: NationalIdType; number: string }> = {};

  readonly items = signal<PaymentMethod[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modal = signal<ModalState>(null);
  readonly deleteTarget = signal<PaymentMethod | null>(null);

  readonly typeLabels = PAYMENT_METHOD_TYPE_LABELS;

  /** Form state. `type` is a signal so the conditional fields react (zoneless). */
  name = '';
  readonly type = signal<PaymentMethodType | ''>('');
  details: Record<string, string> = {};

  readonly typeOptions: SelectOption[] = (
    Object.keys(PAYMENT_METHOD_TYPE_LABELS) as PaymentMethodType[]
  ).map((t) => ({ value: t, label: PAYMENT_METHOD_TYPE_LABELS[t] }));

  readonly currentFields = computed<PaymentMethodField[]>(() => {
    const t = this.type();
    return t ? PAYMENT_METHOD_FIELDS[t] : [];
  });

  constructor() {
    this.load();
  }

  /** Fields of a saved method, to render its details on the card. */
  fieldsOf(type: PaymentMethodType): PaymentMethodField[] {
    return PAYMENT_METHOD_FIELDS[type];
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
    this.type.set('');
    this.details = {};
    this.seedIdParts();
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: PaymentMethod): void {
    this.name = item.name;
    this.type.set(item.type);
    this.details = { ...item.details };
    this.seedIdParts();
    this.error.set(null);
    this.modal.set({ mode: 'edit', item });
  }

  onTypeChange(value: string | number | null): void {
    this.type.set((value as PaymentMethodType) || '');
    this.details = {}; // fields differ per type: start clean
    this.seedIdParts();
  }

  /** (Re)builds the V/E/J + number parts of every idDocument field from `details`. */
  private seedIdParts(): void {
    this.idParts = {};
    for (const field of this.currentFields()) {
      if (field.control === 'idDocument') {
        this.idParts[field.key] = parseNationalId(this.details[field.key] ?? null);
      }
    }
  }

  idType(key: string): NationalIdType {
    return this.idParts[key]?.type ?? 'V';
  }

  idNumber(key: string): string {
    return this.idParts[key]?.number ?? '';
  }

  setIdType(key: string, type: NationalIdType): void {
    const part = (this.idParts[key] ??= { type: 'V', number: '' });
    part.type = type;
    this.syncId(key);
  }

  setIdNumber(key: string, num: string): void {
    const part = (this.idParts[key] ??= { type: 'V', number: '' });
    part.number = (num ?? '').replace(/\D/g, '');
    this.syncId(key);
  }

  /** Composes "V-12345678" into details, or '' while the number is empty. */
  private syncId(key: string): void {
    const part = this.idParts[key]!;
    this.details[key] = part.number ? `${part.type}-${part.number}` : '';
  }

  closeModal(): void {
    this.modal.set(null);
  }

  save(): void {
    const state = this.modal();
    const type = this.type();
    if (!state || !type || this.saving()) return;

    const fields = PAYMENT_METHOD_FIELDS[type];
    const missing = fields.filter((f) => f.required && !(this.details[f.key] ?? '').trim());
    if (!this.name.trim() || missing.length > 0) {
      this.error.set('Completa el nombre y los campos obligatorios.');
      return;
    }
    // Format checks (email, cédula) — same rules the backend enforces.
    for (const field of fields) {
      const problem = paymentFieldError(field, this.details[field.key] ?? '');
      if (problem) {
        this.error.set(problem);
        return;
      }
    }

    this.saving.set(true);
    this.error.set(null);
    const payload = { name: this.name.trim(), type, details: this.cleanDetails() };
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

  /** Only non-empty fields of the current type travel to the API. */
  private cleanDetails(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of this.currentFields()) {
      const value = (this.details[field.key] ?? '').trim();
      if (value) out[field.key] = value;
    }
    return out;
  }

  toggleActive(item: PaymentMethod): void {
    this.api.update(item.id, { isActive: !item.isActive }).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) => this.error.set(this.messageOf(err)),
    });
  }

  confirmDelete(item: PaymentMethod): void {
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
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
