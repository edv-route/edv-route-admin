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
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';

type ModalState = { mode: 'create' } | { mode: 'edit'; item: SubscriptionPlan } | null;

@Component({
  selector: 'app-subscription-plans',
  imports: [FormsModule, SkeletonRows],
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
  priceUsd = 0;

  /**
   * Business decision (2026-07-16): period and vehicle types are NOT editable
   * for now - new tariffs are weekly and apply to every vehicle type (sent as
   * null = "all", so future vehicle types stay covered). Editing an existing
   * plan preserves its stored values instead of silently rewriting them.
   */
  billingPeriod: BillingPeriod = 'weekly';
  private allowedTypesPayload: number[] | null = null;

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
    this.allowedTypesPayload = null; // null = all vehicle types
    this.error.set(null);
    this.modal.set({ mode: 'create' });
  }

  openEdit(item: SubscriptionPlan): void {
    this.name = item.name;
    this.description = item.description ?? '';
    this.billingPeriod = item.billingPeriod;
    this.priceUsd = Number(item.priceUsd);
    this.allowedTypesPayload = item.allowedVehicleTypes;
    this.error.set(null);
    this.modal.set({ mode: 'edit', item });
  }

  /** Locked checkboxes: which ones appear checked (null = all of them). */
  isTypeChecked(id: number): boolean {
    return this.allowedTypesPayload === null || this.allowedTypesPayload.includes(id);
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
      allowedVehicleTypeIds: this.allowedTypesPayload,
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
