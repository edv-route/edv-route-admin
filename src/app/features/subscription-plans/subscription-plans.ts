import { Component, inject, signal } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import {
  BILLING_PERIOD_LABELS,
  type BillingPeriod,
  type SubscriptionPlan,
} from '../../core/models/membership.model';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: SubscriptionPlan } | null;

@Component({
  selector: 'app-subscription-plans',
  imports: [FormsModule],
  templateUrl: './subscription-plans.html',
})
export class SubscriptionPlans {
  private readonly http = inject(HttpClient);
  private readonly vehicleTypesApi = inject(VehicleTypesApi);
  private readonly baseUrl = `${environment.apiUrl}/subscription-plans`;

  readonly periodLabels = BILLING_PERIOD_LABELS;
  readonly items = signal<SubscriptionPlan[]>([]);
  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modal = signal<ModalState>(null);

  name = '';
  description = '';
  billingPeriod: BillingPeriod = 'weekly';
  priceUsd = 0;
  selectedTypes = new Set<number>();

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<SubscriptionPlan[]>(this.baseUrl).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.messageOf(err));
      },
    });
    this.vehicleTypesApi.list().subscribe({
      next: (types) => this.vehicleTypes.set(types.filter((t) => t.active)),
    });
  }

  typeName(id: number): string {
    return this.vehicleTypes().find((t) => t.id === id)?.name ?? `#${id}`;
  }

  openCreate(): void {
    this.name = '';
    this.description = '';
    this.billingPeriod = 'weekly';
    this.priceUsd = 0;
    this.selectedTypes = new Set();
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: SubscriptionPlan): void {
    this.name = item.name;
    this.description = item.description ?? '';
    this.billingPeriod = item.billingPeriod;
    this.priceUsd = Number(item.priceUsd);
    this.selectedTypes = new Set(item.allowedVehicleTypes ?? []);
    this.error.set(null);
    this.modal.set({ mode: 'edit', item });
  }

  toggleType(id: number): void {
    if (this.selectedTypes.has(id)) {
      this.selectedTypes.delete(id);
    } else {
      this.selectedTypes.add(id);
    }
  }

  save(): void {
    const state = this.modal();
    if (!state || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const payload = {
      name: this.name,
      description: this.description.trim() === '' ? null : this.description.trim(),
      billingPeriod: this.billingPeriod,
      priceUsd: this.priceUsd,
      allowedVehicleTypeIds: [...this.selectedTypes],
    };

    const request =
      state.mode === 'create'
        ? this.http.post<SubscriptionPlan>(this.baseUrl, payload)
        : this.http.put<SubscriptionPlan>(`${this.baseUrl}/${state.item.id}`, payload);

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

  toggleActive(item: SubscriptionPlan): void {
    this.http
      .patch<SubscriptionPlan>(`${this.baseUrl}/${item.id}/active`, { active: !item.active })
      .subscribe({
        next: () => this.load(),
        error: (err: HttpErrorResponse) => this.error.set(this.messageOf(err)),
      });
  }

  private messageOf(err: HttpErrorResponse): string {
    return (
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API'
    );
  }
}
