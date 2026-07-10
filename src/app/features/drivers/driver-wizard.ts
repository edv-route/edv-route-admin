import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import type { Requirement } from '../../core/models/requirement.model';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import type { Membership, SubscriptionPlan } from '../../core/models/membership.model';
import { BILLING_PERIOD_LABELS } from '../../core/models/membership.model';
import { RequirementsApi } from '../requirements/requirements.api';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';
import { DriversApi } from './drivers.api';

@Component({
  selector: 'app-driver-wizard',
  imports: [FormsModule, RouterLink],
  templateUrl: './driver-wizard.html',
})
export class DriverWizard {
  private readonly api = inject(DriversApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly periodLabels = BILLING_PERIOD_LABELS;
  readonly step = signal(1);
  readonly driverId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly invoiceNumbers = signal<string[]>([]);

  readonly requirements = signal<Requirement[]>([]);
  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly membership = signal<Membership | null>(null);
  readonly registeredDocs = signal<number>(0);
  readonly vehicleRegistered = signal(false);

  // Step 1
  fullName = '';
  nationalId = '';
  email = '';
  phone = '';
  // Step 2
  docRequirementId: number | null = null;
  docExpiresAt = '';
  // Step 3
  vehicleTypeId: number | null = null;
  brand = '';
  model = '';
  year: number | null = null;
  color = '';
  plate = '';
  // Step 4
  planId: number | null = null;
  periods = 1;

  readonly driverRequirements = computed(() =>
    this.requirements().filter((r) => r.active && r.appliesTo === 'driver'),
  );
  readonly activePlans = computed(() => this.plans().filter((p) => p.active));
  readonly selectedPlan = computed(
    () => this.activePlans().find((p) => p.id === this.planId) ?? null,
  );

  readonly total = computed(() => {
    const m = this.membership();
    const p = this.selectedPlan();
    if (!m || !p) return null;
    return (Number(m.priceUsd) + Number(p.priceUsd) * this.periods).toFixed(2);
  });

  constructor(requirementsApi: RequirementsApi, vehicleTypesApi: VehicleTypesApi) {
    requirementsApi.list().subscribe({ next: (r) => this.requirements.set(r) });
    vehicleTypesApi.list().subscribe({
      next: (t) => this.vehicleTypes.set(t.filter((v) => v.active)),
    });
    this.http.get<SubscriptionPlan[]>(`${environment.apiUrl}/subscription-plans`).subscribe({
      next: (p) => this.plans.set(p),
    });
    this.http.get<Membership>(`${environment.apiUrl}/memberships/current`).subscribe({
      next: (m) => this.membership.set(m),
      error: () => this.membership.set(null),
    });
  }

  saveStep1(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .create({
        fullName: this.fullName,
        nationalId: this.nationalId.trim() || null,
        email: this.email.trim() || null,
        phone: this.phone.trim() || null,
      })
      .subscribe({
        next: (detail) => {
          this.saving.set(false);
          this.driverId.set(detail.userId);
          this.step.set(2);
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  addDocument(): void {
    const id = this.driverId();
    if (!id || !this.docRequirementId || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .addDocument(id, {
        requirementId: this.docRequirementId,
        expiresAt: this.docExpiresAt || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.registeredDocs.update((n) => n + 1);
          this.docRequirementId = null;
          this.docExpiresAt = '';
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  saveStep3(): void {
    const id = this.driverId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .addVehicle(id, {
        vehicleTypeId: this.vehicleTypeId,
        brand: this.brand.trim() || null,
        model: this.model.trim() || null,
        year: this.year,
        color: this.color.trim() || null,
        plate: this.plate.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.vehicleRegistered.set(true);
          this.step.set(4);
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  enroll(): void {
    const id = this.driverId();
    if (!id || !this.planId || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.enroll(id, this.planId, this.periods).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.invoiceNumbers.set(result.invoiceNumbers);
        this.step.set(5); // summary
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  approveNow(): void {
    const id = this.driverId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.api.approve(id).subscribe({
      next: () => void this.router.navigate(['/drivers', id]),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  finishPending(): void {
    const id = this.driverId();
    void this.router.navigate(id ? ['/drivers', id] : ['/drivers']);
  }

  skipTo(step: number): void {
    this.error.set(null);
    this.step.set(step);
  }

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
    );
  }
}
