import { Component, computed, inject, signal, viewChild } from '@angular/core';
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
import { Select, type SelectOption } from '../../shared/components/select';
import { ActionMenu, type ActionMenuItem } from '../../shared/components/action-menu';
import {
  PASSWORD_MIN_LENGTH,
  PasswordPolicyDirective,
  passwordPolicyErrors,
} from '../../shared/directives/password-policy.directive';
import { INPUT_FILTERS } from '../../shared/directives/input-filters';
import { DocumentsApi } from '../documents/documents.api';
import { DriversApi, type CreateDriverInput } from './drivers.api';
import { VehicleDraftModal, type VehicleDraft } from './vehicle-draft-modal';
import { DocumentDraftModal, type DocDraft } from './document-draft-modal';
import { PaymentDraftModal, type PaymentDraft } from './payment-draft-modal';
import { PaymentSubmissionsApi } from '../billing/payment-submissions.api';
import {
  NATIONAL_ID_OPTIONS,
  PHONE_COUNTRY_OPTIONS,
  PHONE_OPERATOR_OPTIONS,
  composePerson,
  emptyPersonForm,
  maxBirthDate,
} from './person-form';

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
  imports: [FormsModule, RouterLink, Select, PasswordInput, DatePicker, PasswordPolicyDirective, ...INPUT_FILTERS, VehicleDraftModal, DocumentDraftModal, PaymentDraftModal, ActionMenu],
  templateUrl: './driver-wizard.html',
})
export class DriverWizard {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly submissionsApi = inject(PaymentSubmissionsApi);
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
  readonly phoneOperatorOptions = PHONE_OPERATOR_OPTIONS;
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  private readonly step1Form = viewChild<NgForm>('step1Form');
  private composed: CreateDriverInput | null = null;

  // Step 2: driver documents queued client-side. The editor lives in the
  // `app-document-draft-modal` dialog; the wizard only holds the list.
  readonly docs = signal<DocDraft[]>([]);
  readonly docModalOpen = signal(false);
  /** Index being edited in the dialog; null = adding a new document. */
  readonly editingDocIndex = signal<number | null>(null);
  /** The draft the dialog is seeded with (edit mode), or null when adding. */
  readonly editingDocDraft = computed(() => {
    const i = this.editingDocIndex();
    return i === null ? null : this.docs()[i] ?? null;
  });
  /** Requirement ids used by the OTHER queued documents (excludes the edited one). */
  readonly docTakenIds = computed(() => {
    const editing = this.editingDocIndex();
    return this.docs().filter((_, i) => i !== editing).map((d) => d.requirementId);
  });

  // Step 3: vehicles queued client-side (each with its photos + documents).
  // The editor lives in the `app-vehicle-draft-modal` dialog; the wizard only
  // holds the accumulated list and never persists a vehicle before register().
  readonly vehicles = signal<VehicleDraft[]>([]);
  readonly vehicleModalOpen = signal(false);
  /** Index being edited in the dialog; null = adding a new vehicle. */
  readonly editingIndex = signal<number | null>(null);
  /** The draft the dialog is seeded with (edit mode), or null when adding. */
  readonly editingDraft = computed(() => {
    const i = this.editingIndex();
    return i === null ? null : this.vehicles()[i] ?? null;
  });

  // Step 3: each vehicle's documents are captured from its card, in a separate
  // app-document-draft-modal (appliesTo="vehicle").
  readonly vehicleDocModalOpen = signal(false);
  /** Which vehicle (index) the document dialog is targeting. */
  readonly docVehicleIndex = signal<number | null>(null);
  /** Document index being edited within that vehicle; null = adding. */
  readonly editingVehicleDocIndex = signal<number | null>(null);
  /** The vehicle document the dialog is seeded with (edit mode), or null. */
  readonly editingVehicleDoc = computed<DocDraft | null>(() => {
    const v = this.docVehicleIndex();
    const d = this.editingVehicleDocIndex();
    if (v === null || d === null) return null;
    return this.vehicles()[v]?.documents[d] ?? null;
  });
  /** Requirement ids used by the OTHER documents of the targeted vehicle. */
  readonly vehicleDocTakenIds = computed<number[]>(() => {
    const v = this.docVehicleIndex();
    if (v === null) return [];
    const editing = this.editingVehicleDocIndex();
    return (this.vehicles()[v]?.documents ?? [])
      .filter((_, j) => j !== editing)
      .map((d) => d.requirementId);
  });

  // Step 4: payment (captured in the app-payment-draft-modal dialog; one payment).
  planId: number | null = null;
  /**
   * The "Semanas" field is text-backed so it can be emptied while typing; the
   * canonical count is the `periods` getter, which reads blank/invalid as 1.
   * The field snaps back to "1" on blur (see onPeriodsBlur).
   */
  periodsText = '1';

  /** Canonical weeks count: blank or out-of-range reads as 1, capped at 999. */
  get periods(): number {
    const n = parseInt(this.periodsText, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(999, n) : 1;
  }
  readonly paymentModalOpen = signal(false);
  readonly paymentDraft = signal<PaymentDraft | null>(null);
  /** Whether a payment was added: gates the two final buttons (mutually exclusive). */
  readonly hasPayment = computed(() => this.paymentDraft() !== null);

  readonly driverRequirements = computed(() =>
    this.requirements().filter((r) => r.active && r.appliesTo === 'driver'),
  );
  /** Requirements still selectable: a requirement can be documented only once. */
  readonly availableDocRequirements = computed(() => {
    const used = new Set(this.docs().map((d) => d.requirementId));
    return this.driverRequirements().filter((r) => !used.has(r.id));
  });
  readonly activePlans = computed(() => this.plans().filter((p) => p.active));
  /** A single active tariff is preselected and its dropdown locked. */
  readonly singlePlan = computed(() => this.activePlans().length === 1);
  readonly planOptions = computed<SelectOption[]>(() =>
    this.activePlans().map((p) => ({
      value: p.id,
      label: `${p.name} — ${this.periodLabels[p.billingPeriod]} $${p.priceUsd}`,
    })),
  );
  readonly selectedPlan = computed(
    () => this.activePlans().find((p) => p.id === this.planId) ?? null,
  );
  /**
   * Total charged = membership + tariff × periods. A method, NOT a computed:
   * `periods` (and `planId`) are plain ngModel fields, so a computed would cache
   * the first value and never react to the free "Semanas" input. As a method it
   * re-evaluates on each change detection with the live period count.
   */
  total(): string | null {
    const m = this.membership();
    const p = this.selectedPlan();
    if (!m || !p) return null;
    return (Number(m.priceUsd) + Number(p.priceUsd) * this.periods).toFixed(2);
  }

  /** Digits-only, up to 3 chars, leading zeros stripped. May be left BLANK while
   *  typing (so the user can clear it); the canonical `periods` reads blank as 1. */
  onPeriodsInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 3).replace(/^0+/, '');
    this.periodsText = digits;
    if (input.value !== digits) input.value = digits;
  }

  /** On leaving the field, an empty/invalid value snaps back to "1". */
  onPeriodsBlur(): void {
    if (!this.periodsText || this.periods < 1) this.periodsText = '1';
    else this.periodsText = String(this.periods);
  }

  constructor(requirementsApi: RequirementsApi, vehicleTypesApi: VehicleTypesApi) {
    requirementsApi.list().subscribe({ next: (r) => this.requirements.set(r) });
    vehicleTypesApi.list().subscribe({
      next: (t) => this.vehicleTypes.set(t.filter((v) => v.active)),
    });
    this.http.get<SubscriptionPlan[]>(`${environment.apiUrl}/subscription-plans`).subscribe({
      next: (p) => {
        this.plans.set(p);
        // Preselect the tariff when it is the only active one (the select is then
        // locked in the template): one less click and the total shows at once.
        const active = p.filter((x) => x.active);
        if (active.length === 1) this.planId = active[0]!.id;
      },
    });
    this.http.get<Membership>(`${environment.apiUrl}/memberships/current`).subscribe({
      next: (m) => this.membership.set(m),
      error: () => this.membership.set(null),
    });
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
    // DEV: environment.unlockSteps skips the step-1 gate to ease visual review.
    if (target > 1 && !environment.unlockSteps && !this.validateStep1()) return;
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

  // --- Step 2: documents (captured in the app-document-draft-modal dialog) ---

  openAddDocument(): void {
    this.editingDocIndex.set(null);
    this.docModalOpen.set(true);
  }

  editDocument(index: number): void {
    this.editingDocIndex.set(index);
    this.docModalOpen.set(true);
  }

  closeDocModal(): void {
    this.docModalOpen.set(false);
    this.editingDocIndex.set(null);
  }

  /** Appends the emitted document draft, or replaces the edited one. */
  onDocumentSaved(draft: DocDraft): void {
    const index = this.editingDocIndex();
    if (index === null) {
      this.docs.update((list) => [...list, draft]);
    } else {
      this.docs.update((list) => list.map((d, i) => (i === index ? draft : d)));
    }
    this.closeDocModal();
    this.error.set(null);
  }

  removeDocumentDraft(index: number): void {
    this.docs.update((list) => list.filter((_, i) => i !== index));
  }

  // --- Step 3: vehicles (captured in the app-vehicle-draft-modal dialog) ---

  openAddVehicle(): void {
    this.editingIndex.set(null);
    this.vehicleModalOpen.set(true);
  }

  editVehicleDraft(index: number): void {
    this.editingIndex.set(index);
    this.vehicleModalOpen.set(true);
  }

  closeVehicleModal(): void {
    this.vehicleModalOpen.set(false);
    this.editingIndex.set(null);
  }

  /**
   * Persists the draft emitted by the modal: appends it (add mode) or replaces
   * the edited one (revoking the previous version's photo URLs, since the dialog
   * handed over fresh ones). The wizard owns the URLs from here on.
   */
  onVehicleSaved(draft: VehicleDraft): void {
    const index = this.editingIndex();
    if (index === null) {
      this.vehicles.update((list) => [...list, draft]);
    } else {
      const previous = this.vehicles()[index];
      if (previous) for (const p of previous.photos) URL.revokeObjectURL(p.url);
      this.vehicles.update((list) => list.map((v, i) => (i === index ? draft : v)));
    }
    this.closeVehicleModal();
    this.error.set(null);
  }

  removeVehicleDraft(index: number): void {
    const v = this.vehicles()[index];
    if (v) for (const p of v.photos) URL.revokeObjectURL(p.url);
    this.vehicles.update((list) => list.filter((_, i) => i !== index));
  }

  /** Card-level actions for a vehicle draft, rendered as a ⋮ menu on its row. */
  readonly vehicleMenu: ActionMenuItem[] = [
    {
      key: 'edit',
      label: 'Editar vehículo',
      iconPath:
        'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125',
    },
    {
      key: 'remove',
      label: 'Quitar vehículo',
      danger: true,
      iconPath:
        'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
    },
  ];

  onVehicleAction(key: string, index: number): void {
    if (key === 'edit') this.editVehicleDraft(index);
    else if (key === 'remove') this.removeVehicleDraft(index);
  }

  // --- Step 3: a vehicle's documents (app-document-draft-modal per card) ---

  openAddVehicleDoc(vehicleIndex: number): void {
    this.docVehicleIndex.set(vehicleIndex);
    this.editingVehicleDocIndex.set(null);
    this.vehicleDocModalOpen.set(true);
  }

  editVehicleDoc(vehicleIndex: number, docIndex: number): void {
    this.docVehicleIndex.set(vehicleIndex);
    this.editingVehicleDocIndex.set(docIndex);
    this.vehicleDocModalOpen.set(true);
  }

  closeVehicleDocModal(): void {
    this.vehicleDocModalOpen.set(false);
    this.docVehicleIndex.set(null);
    this.editingVehicleDocIndex.set(null);
  }

  /** Appends the emitted document to the targeted vehicle, or replaces the edited one. */
  onVehicleDocSaved(draft: DocDraft): void {
    const vIndex = this.docVehicleIndex();
    if (vIndex === null) return;
    const dIndex = this.editingVehicleDocIndex();
    this.vehicles.update((list) =>
      list.map((v, i) => {
        if (i !== vIndex) return v;
        const documents =
          dIndex === null
            ? [...v.documents, draft]
            : v.documents.map((d, j) => (j === dIndex ? draft : d));
        return { ...v, documents };
      }),
    );
    this.closeVehicleDocModal();
  }

  removeVehicleDoc(vehicleIndex: number, docIndex: number): void {
    this.vehicles.update((list) =>
      list.map((v, i) =>
        i === vehicleIndex ? { ...v, documents: v.documents.filter((_, j) => j !== docIndex) } : v,
      ),
    );
  }

  // --- Step 4: payment (captured in the app-payment-draft-modal dialog) ---

  openAddPayment(): void {
    this.error.set(null);
    this.paymentModalOpen.set(true);
  }

  closePaymentModal(): void {
    this.paymentModalOpen.set(false);
  }

  /** Holds the emitted payment draft (add or edit) and closes the dialog. */
  onPaymentSaved(draft: PaymentDraft): void {
    this.paymentDraft.set(draft);
    this.closePaymentModal();
    this.error.set(null);
  }

  removePayment(): void {
    this.paymentDraft.set(null);
  }

  /**
   * Final submit: creates the driver with its vehicles, documents and (when
   * chosen) the payment in a single transaction, then uploads the document
   * files. `withPayment` false leaves the driver pending.
   */
  /**
   * Multipart body of the alta's ENROLL submission (v9, 2026-08-04): membership +
   * N weeks in ONE invoice on approval. The amount is derived by the backend from
   * `periods` × tariff + membership (the total shown in the summary), so no captured
   * cash amount is sent — the weeks are the source of truth.
   */
  private buildEnrollForm(draft: PaymentDraft): FormData {
    const form = new FormData();
    form.set('purpose', 'enroll');
    form.set('periods', String(this.periods));
    if (draft.paymentMethodId != null) form.set('paymentMethodId', String(draft.paymentMethodId));
    if (draft.reference) form.set('reference', draft.reference);
    if (draft.payerBank) form.set('payerBank', draft.payerBank);
    if (draft.paidOn) form.set('paidOn', draft.paidOn);
    if (draft.payerPhone) form.set('payerPhone', draft.payerPhone);
    if (draft.payerId) form.set('payerId', draft.payerId);
    if (draft.payerAccount) form.set('payerAccount', draft.payerAccount);
    for (const f of draft.files) form.append('files', f, f.name);
    return form;
  }

  register(withPayment: boolean): void {
    if (this.saving()) return;
    if (!this.validateStep1()) {
      this.step.set(1);
      return;
    }
    const draft = this.paymentDraft();
    const sendPayment = withPayment && !!draft;
    const vehicleDrafts = this.vehicles();
    const vehicles = vehicleDrafts.map((v) => ({
      vehicleTypeId: v.vehicleTypeId,
      brand: v.brand.trim() || null,
      model: v.model.trim() || null,
      year: v.year,
      color: v.color.trim() || null,
      plate: v.plate.trim() || null,
      documents: v.documents.map((d) => ({ requirementId: d.requirementId })),
    }));
    const docDrafts = this.docs();
    // expiresAt is being retired from the UI; always null until the DB column is
    // dropped (Fase 5). The register contract still carries the field.
    const documents = docDrafts.map((d) => ({ requirementId: d.requirementId, expiresAt: null }));

    this.saving.set(true);
    this.error.set(null);
    this.fileWarning.set(null);
    // v9: the alta never settles on the spot. With a payment, the alta is deferred
    // (no base debt is emitted) and the captured payment becomes a PENDING `enroll`
    // submission = membership + N weeks in ONE invoice, approved in Facturación →
    // "Por aprobar". Without a payment, the driver is registered owing the base
    // alta debt (membership + 1 week) to settle later.
    this.api
      .register(this.composed!, { payment: null, deferredEnrollment: sendPayment, vehicles, documents })
      .pipe(
        switchMap((result) => {
          const uploads = docDrafts
            .map((d, i) => ({ file: d.file, id: result.createdDocumentIds[i] }))
            .filter((x): x is { file: File; id: string } => !!x.file && !!x.id)
            .map((x) =>
              this.documentsApi.uploadFile(x.id, x.file).pipe(
                map(() => true),
                catchError(() => of(false)),
              ),
            );
          vehicleDrafts.forEach((v, i) => {
            const created = result.createdVehicles[i];
            if (!created) return;
            for (const photo of v.photos) {
              uploads.push(
                this.api.vehicleImageUpload(result.userId, created.id, photo.file).pipe(
                  map(() => true),
                  catchError(() => of(false)),
                ),
              );
            }
            v.documents.forEach((d, j) => {
              const docId = created.documentIds[j];
              if (d.file && docId) {
                uploads.push(
                  this.documentsApi.uploadFile(docId, d.file).pipe(
                    map(() => true),
                    catchError(() => of(false)),
                  ),
                );
              }
            });
          });
          return (uploads.length ? forkJoin(uploads) : of<boolean[]>([])).pipe(
            map((flags) => ({ result, flags })),
          );
        }),
        switchMap(({ result, flags }) => {
          // The captured payment → pending ENROLL submission (membership + N weeks).
          if (sendPayment && draft) {
            return this.submissionsApi.create(result.userId, this.buildEnrollForm(draft)).pipe(
              map(() => ({ result, flags, paymentSent: true })),
              catchError(() => of({ result, flags, paymentSent: false })),
            );
          }
          return of({ result, flags, paymentSent: false });
        }),
      )
      .subscribe({
        next: ({ result, flags, paymentSent }) => {
          this.saving.set(false);
          this.driverId.set(result.userId);
          this.invoiceNumbers.set(result.invoiceNumbers ?? []);
          this.paidAtRegister.set(paymentSent);
          const failed = flags.filter((ok) => !ok).length;
          if (failed > 0) {
            this.fileWarning.set(
              `${failed} archivo(s) no se pudieron subir. Adjúntalos desde el perfil o Facturación.`,
            );
          }
          if (sendPayment && !paymentSent) {
            this.fileWarning.set(
              'El afiliado se registró, pero el pago no se pudo enviar. Regístralo desde el perfil (Registrar pago).',
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
