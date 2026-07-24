import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { FormsModule, type NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { Requirement } from '../../core/models/requirement.model';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import type { Membership, SubscriptionPlan } from '../../core/models/membership.model';
import { BILLING_PERIOD_LABELS } from '../../core/models/membership.model';
import { RequirementsApi } from '../requirements/requirements.api';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';
import { DatePicker } from '../../shared/components/date-picker';
import { PasswordInput } from '../../shared/components/password-input';
import { Select } from '../../shared/components/select';
import {
  PASSWORD_MIN_LENGTH,
  PasswordPolicyDirective,
  passwordPolicyErrors,
} from '../../shared/directives/password-policy.directive';
import { DocumentsApi, validateFile } from '../documents/documents.api';
import { DriversApi, type CreateDriverInput } from './drivers.api';
import {
  NATIONAL_ID_OPTIONS,
  PHONE_COUNTRY_OPTIONS,
  composePerson,
  emptyPersonForm,
  maxBirthDate,
} from './person-form';

/** A document queued in the wizard; the File is uploaded after registration. */
interface DocDraft {
  requirementId: number;
  requirementName: string;
  expiresAt: string;
  file: File | null;
  fileName: string | null;
}

/** A vehicle queued in the wizard (persisted with the alta transaction). */
interface VehicleDraft {
  vehicleTypeId: number | null;
  brand: string;
  model: string;
  year: number | null;
  color: string;
  plate: string;
}

/**
 * Registration wizard (decision 2026-07-21): personal data, documents, vehicle
 * and payment are accumulated in the client and sent together in the single
 * transactional `POST /drivers/register`. Nothing is persisted before the final
 * submit - so there is no half-registered affiliate. Document files are uploaded
 * afterwards (best-effort, like the profile: a document may exist without a file
 * and get one attached later).
 */
@Component({
  selector: 'app-driver-wizard',
  imports: [FormsModule, RouterLink, Select, PasswordInput, DatePicker, PasswordPolicyDirective],
  templateUrl: './driver-wizard.html',
})
export class DriverWizard {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly periodLabels = BILLING_PERIOD_LABELS;
  // 1 Datos · 2 Documentos · 3 Vehículo · 4 Pago · 5 Resumen
  readonly step = signal(1);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly driverId = signal<string | null>(null);
  readonly invoiceNumbers = signal<string[]>([]);
  readonly fileWarning = signal<string | null>(null);
  /** Whether the alta included a payment (gates "Aprobar ahora" in the summary). */
  readonly paidAtRegister = signal(false);

  readonly requirements = signal<Requirement[]>([]);
  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly membership = signal<Membership | null>(null);

  // Step 1: personal data (composition/validation shared with the profile edit).
  person = emptyPersonForm();
  readonly maxBirthDate = maxBirthDate();
  readonly nationalIdOptions = NATIONAL_ID_OPTIONS;
  readonly phoneCountryOptions = PHONE_COUNTRY_OPTIONS;
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  private readonly step1Form = viewChild<NgForm>('step1Form');
  private composed: CreateDriverInput | null = null;

  // Step 2: documents queued client-side (add-to-list, like the old wizard)
  readonly docs = signal<DocDraft[]>([]);
  docRequirementId: number | null = null;
  docExpiresAt = '';
  docFile: File | null = null;
  private readonly docFileInput = viewChild<ElementRef<HTMLInputElement>>('docFileInput');

  // Step 3: vehicles queued client-side
  readonly vehicles = signal<VehicleDraft[]>([]);
  vehicleForm: VehicleDraft = this.emptyVehicle();

  // Step 4: payment
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
  readonly canAddVehicle = computed(() => {
    const v = this.vehicleForm;
    return v.vehicleTypeId !== null || !!v.brand.trim() || !!v.plate.trim();
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

  private emptyVehicle(): VehicleDraft {
    return { vehicleTypeId: null, brand: '', model: '', year: null, color: '', plate: '' };
  }

  vehicleTypeName(id: number | null): string {
    return this.vehicleTypes().find((t) => t.id === id)?.name ?? 'Sin definir';
  }

  /** Live password checklist (person.password is a plain field, not a signal). */
  passwordChecks(): { minLength: boolean } {
    return passwordPolicyErrors(this.person.password);
  }

  /**
   * Moving forward past step 1 requires valid personal data (document +
   * password are the app login, mandatory from the panel). Nothing is persisted
   * yet, so navigation between the later steps is free.
   */
  goToStep(target: number): void {
    if (target === this.step()) return;
    if (target > 1 && !this.validateStep1()) return;
    this.error.set(null);
    this.step.set(target);
  }

  private validateStep1(): boolean {
    const form = this.step1Form();
    if (form?.invalid) {
      form.control.markAllAsTouched();
      this.error.set('Revisa los campos marcados en rojo.');
      return false;
    }
    const result = composePerson(this.person, { requireCredentials: true });
    if (!result.ok) {
      this.error.set(result.error);
      return false;
    }
    this.composed = result.input;
    return true;
  }

  // --- Step 2: documents ---
  onDocFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) {
      this.docFile = null;
      return;
    }
    const problem = validateFile(file);
    if (problem) {
      this.error.set(problem);
      this.clearDocFileInput();
      return;
    }
    this.error.set(null);
    this.docFile = file;
  }

  private clearDocFileInput(): void {
    this.docFile = null;
    const input = this.docFileInput()?.nativeElement;
    if (input) input.value = '';
  }

  addDocumentDraft(): void {
    const req = this.driverRequirements().find((r) => r.id === this.docRequirementId);
    if (!req) {
      this.error.set('Selecciona un requerimiento.');
      return;
    }
    this.docs.update((list) => [
      ...list,
      {
        requirementId: req.id,
        requirementName: req.name,
        expiresAt: this.docExpiresAt,
        file: this.docFile,
        fileName: this.docFile?.name ?? null,
      },
    ]);
    this.docRequirementId = null;
    this.docExpiresAt = '';
    this.clearDocFileInput();
    this.error.set(null);
  }

  removeDocumentDraft(index: number): void {
    this.docs.update((list) => list.filter((_, i) => i !== index));
  }

  // --- Step 3: vehicles ---
  addVehicleDraft(): void {
    if (!this.canAddVehicle()) return;
    this.vehicles.update((list) => [...list, { ...this.vehicleForm }]);
    this.vehicleForm = this.emptyVehicle();
    this.error.set(null);
  }

  removeVehicleDraft(index: number): void {
    this.vehicles.update((list) => list.filter((_, i) => i !== index));
  }

  /**
   * Final submit: creates the driver with its vehicles, documents and (when
   * chosen) the payment in a single transaction, then uploads the document
   * files. `withPayment` false leaves the driver pending.
   */
  register(withPayment: boolean): void {
    if (this.saving()) return;
    if (!this.validateStep1()) {
      this.step.set(1);
      return;
    }
    const payment =
      withPayment && this.planId ? { planId: this.planId, periods: this.periods } : null;
    const vehicles = this.vehicles().map((v) => ({
      vehicleTypeId: v.vehicleTypeId,
      brand: v.brand.trim() || null,
      model: v.model.trim() || null,
      year: v.year,
      color: v.color.trim() || null,
      plate: v.plate.trim() || null,
    }));
    const docDrafts = this.docs();
    const documents = docDrafts.map((d) => ({
      requirementId: d.requirementId,
      expiresAt: d.expiresAt || null,
    }));

    this.saving.set(true);
    this.error.set(null);
    this.fileWarning.set(null);
    this.api
      .register(this.composed!, { payment, vehicles, documents })
      .pipe(
        switchMap((result) => {
          // Upload each queued file against its created document id (same order).
          const uploads = docDrafts
            .map((d, i) => ({ file: d.file, id: result.createdDocumentIds[i] }))
            .filter((x): x is { file: File; id: string } => !!x.file && !!x.id)
            .map((x) =>
              this.documentsApi.uploadFile(x.id, x.file).pipe(
                map(() => true),
                catchError(() => of(false)),
              ),
            );
          return (uploads.length ? forkJoin(uploads) : of<boolean[]>([])).pipe(
            map((flags) => ({ result, flags })),
          );
        }),
      )
      .subscribe({
        next: ({ result, flags }) => {
          this.saving.set(false);
          this.driverId.set(result.userId);
          this.invoiceNumbers.set(result.invoiceNumbers ?? []);
          this.paidAtRegister.set(payment !== null);
          const failed = flags.filter((ok) => !ok).length;
          if (failed > 0) {
            this.fileWarning.set(
              `${failed} archivo(s) no se pudieron subir. Adjúntalos desde el perfil del afiliado.`,
            );
          }
          this.step.set(5);
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

  finish(): void {
    const id = this.driverId();
    void this.router.navigate(id ? ['/drivers', id] : ['/drivers']);
  }

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
    );
  }
}
