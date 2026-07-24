import { Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type {
  DriverDetail as DriverDetailModel,
  DriverDocument,
} from '../../core/models/driver.model';
import { DRIVER_STATUS_LABELS } from '../../core/models/driver.model';
import type { Requirement } from '../../core/models/requirement.model';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import type { SubscriptionPlan } from '../../core/models/membership.model';
import { BILLING_PERIOD_LABELS } from '../../core/models/membership.model';
import { environment } from '../../../environments/environment';
import { RequirementsApi } from '../requirements/requirements.api';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';
import { DatePicker } from '../../shared/components/date-picker';
import { PasswordInput } from '../../shared/components/password-input';
import { Select, type SelectOption } from '../../shared/components/select';
import { DocumentsApi, validateFile } from '../documents/documents.api';
import { DriversApi } from './drivers.api';
import { PaymentMethodsApi } from '../payment-methods/payment-methods.api';
import {
  PAYMENT_METHOD_FIELDS,
  PAYMENT_METHOD_TYPE_LABELS,
  VENEZUELAN_BANKS,
  type PaymentMethod,
} from '../../core/models/payment-method.model';
import {
  NATIONAL_ID_OPTIONS,
  PHONE_COUNTRY_OPTIONS,
  composePerson,
  emptyPersonForm,
  maxBirthDate,
  parseNationalId,
  parsePhoneNumber,
} from './person-form';

@Component({
  selector: 'app-driver-detail',
  imports: [FormsModule, DatePipe, RouterLink, Select, PasswordInput, DatePicker, NgTemplateOutlet],
  templateUrl: './driver-detail.html',
})
export class DriverDetail {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly paymentMethodsApi = inject(PaymentMethodsApi);

  readonly id = input.required<string>();
  readonly statusLabels = DRIVER_STATUS_LABELS;

  readonly driver = signal<DriverDetailModel | null>(null);
  readonly requirements = signal<Requirement[]>([]);
  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly editOpen = signal(false);
  readonly confirmAction = signal<'approve' | 'reject' | null>(null);
  readonly renewOpen = signal(false);
  readonly renewPeriods = signal(1);
  readonly renewResult = signal<string | null>(null);
  readonly uploadingDocId = signal<string | null>(null);
  readonly plans = signal<SubscriptionPlan[]>([]);
  /** null = keep the current plan; a number = change to that plan. */
  readonly renewPlanId = signal<number | null>(null);
  readonly cancelChangeOpen = signal(false);
  /** External payment (v8): the note leaves the reason on the record. */
  readonly externalPayOpen = signal(false);
  externalPayNote = '';
  /** Post-registration charge (membership + tariff) for a driver without payment. */
  readonly enrollOpen = signal(false);
  readonly enrollPeriods = signal(1);
  readonly membership = signal<{ id: number; name: string; priceUsd: string } | null>(null);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  /** Payment capture shared by the enroll and external-payment modals (Pieza 2). */
  readonly payMethodId = signal<number | null>(null);
  payReference = '';
  readonly payerBank = signal<string | null>(null);
  payFile: File | null = null;
  private readonly payFileInput = viewChild<ElementRef<HTMLInputElement>>('payFileInput');
  readonly periodLabels = BILLING_PERIOD_LABELS;

  // Fleet + documents are living data managed here (moved out of the alta,
  // decision 2026-07-21). Both reuse the existing driver sub-endpoints.
  readonly addVehicleOpen = signal(false);
  readonly addDocOpen = signal(false);
  vehicleForm = { vehicleTypeId: null as number | null, brand: '', model: '', year: null as number | null, color: '', plate: '' };
  docRequirementId: number | null = null;
  docExpiresAt = '';
  docFile: File | null = null;
  private readonly docFileInput = viewChild<ElementRef<HTMLInputElement>>('docFileInput');

  person = emptyPersonForm();
  readonly maxBirthDate = maxBirthDate();
  readonly nationalIdOptions = NATIONAL_ID_OPTIONS;
  readonly phoneCountryOptions = PHONE_COUNTRY_OPTIONS;
  private readonly editForm = viewChild<NgForm>('editForm');

  /** Active driver-requirements with no registered document = visibly incomplete. */
  readonly missingRequirements = computed(() => {
    const d = this.driver();
    if (!d) return [];
    const covered = new Set(d.documents.map((doc) => doc.requirementId));
    return this.requirements().filter(
      (r) => r.active && r.appliesTo === 'driver' && !covered.has(r.id),
    );
  });

  /** Active driver requirements offered when adding a document from the profile. */
  readonly driverRequirements = computed(() =>
    this.requirements().filter((r) => r.active && r.appliesTo === 'driver'),
  );

  /** Active catalog for the plan-change picker (archived ones are excluded). */
  readonly activePlans = computed(() => this.plans().filter((p) => p.active));

  readonly selectedPlan = computed(() =>
    this.plans().find((p) => p.id === this.renewPlanId()) ?? null,
  );

  /** The single active tariff (weekly) used to enroll a driver post-registration. */
  readonly weeklyPlan = computed(() =>
    this.plans().find((p) => p.active && p.billingPeriod === 'weekly')
      ?? this.plans().find((p) => p.active)
      ?? null,
  );

  /** Total the enroll modal will charge: membership (once) + tariff × weeks. */
  readonly enrollTotal = computed(() => {
    const plan = this.weeklyPlan();
    const m = this.membership();
    if (!plan) return null;
    const tariff = Number(plan.priceUsd) * this.enrollPeriods();
    const memb = m && !this.driver()?.membershipPayment ? Number(m.priceUsd) : 0;
    return (tariff + memb).toFixed(2);
  });

  /** Active payment methods offered when registering a payment. */
  readonly methodOptions = computed<SelectOption[]>(() =>
    this.paymentMethods()
      .filter((m) => m.isActive)
      .map((m) => ({ value: m.id, label: `${m.name} · ${PAYMENT_METHOD_TYPE_LABELS[m.type]}` })),
  );
  readonly bankOptions = VENEZUELAN_BANKS;

  /** Details of the selected method, mapped to human labels so the admin can
   * confirm the account the driver paid into. Select values are resolved to
   * their readable option label; empty details are dropped. */
  readonly selectedMethodDetails = computed<{ label: string; value: string }[]>(() => {
    const method = this.paymentMethods().find((m) => m.id === this.payMethodId());
    if (!method) return [];
    return PAYMENT_METHOD_FIELDS[method.type]
      .map((field) => {
        const raw = method.details[field.key]?.trim();
        if (!raw) return null;
        const value =
          field.control === 'select'
            ? (field.options?.find((o) => o.value === raw)?.label ?? raw)
            : raw;
        return { label: field.label, value };
      })
      .filter((row): row is { label: string; value: string } => row !== null);
  });

  constructor(requirementsApi: RequirementsApi, vehicleTypesApi: VehicleTypesApi) {
    requirementsApi.list().subscribe({ next: (r) => this.requirements.set(r) });
    vehicleTypesApi.list().subscribe({
      next: (t) => this.vehicleTypes.set(t.filter((v) => v.active)),
    });
    // Tariffs have no API service yet (same as the wizard) - see restructure notes
    this.http
      .get<SubscriptionPlan[]>(`${environment.apiUrl}/subscription-plans`)
      .subscribe({ next: (plans) => this.plans.set(plans) });
    // Current membership (price + name) to show the enroll total; benefits come
    // with the driver detail itself.
    this.http
      .get<{ id: number; name: string; priceUsd: string }>(`${environment.apiUrl}/memberships/current`)
      .subscribe({ next: (m) => this.membership.set(m), error: () => {} });
    this.paymentMethodsApi.list().subscribe({
      next: (m) => this.paymentMethods.set(m),
      error: () => {},
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.detail(this.id()).subscribe({
      next: (d) => {
        this.driver.set(d);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.fail(err);
      },
    });
  }

  openEdit(): void {
    const d = this.driver();
    if (!d) return;
    const nationalId = parseNationalId(d.nationalId);
    this.person = {
      ...emptyPersonForm(),
      firstName: d.firstName,
      middleName: d.middleName ?? '',
      lastName: d.lastName,
      secondLastName: d.secondLastName ?? '',
      birthDate: d.birthDate?.slice(0, 10) ?? '',
      address: d.address ?? '',
      email: d.email ?? '',
      nationalIdType: nationalId.type,
      nationalIdNumber: nationalId.number,
      phoneNumber: parsePhoneNumber(d.phone),
      // Password fields stay empty: blank = keep the current app password
    };
    this.error.set(null);
    this.editOpen.set(true);
  }

  saveEdit(): void {
    if (this.saving()) return;

    const form = this.editForm();
    if (form?.invalid) {
      form.control.markAllAsTouched();
      this.error.set('Revisa los campos marcados en rojo.');
      return;
    }

    const result = composePerson(this.person);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.saving.set(true);
    this.api.update(this.id(), result.input).subscribe({
      next: () => {
        this.saving.set(false);
        this.editOpen.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  runAction(): void {
    const action = this.confirmAction();
    if (!action || this.saving()) return;
    this.saving.set(true);
    const request = action === 'approve' ? this.api.approve(this.id()) : this.api.reject(this.id());
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.confirmAction.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.confirmAction.set(null);
        this.fail(err);
      },
    });
  }

  openRenew(): void {
    this.renewPeriods.set(1);
    this.renewPlanId.set(null);
    this.renewResult.set(null);
    this.error.set(null);
    this.renewOpen.set(true);
  }

  renew(): void {
    if (this.saving()) return;
    this.saving.set(true);
    const planId = this.renewPlanId();

    this.api.renewSubscription(this.id(), this.renewPeriods(), planId ?? undefined).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.renewOpen.set(false);
        const invoices = `Factura(s): N° ${result.invoiceNumbers.join(', N° ')}`;
        if (result.planChanged) {
          const starts = result.startsAt
            ? new Date(result.startsAt).toLocaleDateString('es-VE')
            : null;
          this.renewResult.set(
            result.reactivated
              ? `Tarifa cambiada y activa desde ahora. ${invoices}`
              : `Cambio de tarifa programado: comienza el ${starts} al agotarse lo pagado. ${invoices}`,
          );
        } else {
          this.renewResult.set(
            `${result.reactivated ? 'Tarifa reactivada. ' : ''}${invoices}`,
          );
        }
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.renewOpen.set(false);
        this.fail(err);
      },
    });
  }

  openEnroll(): void {
    this.enrollPeriods.set(1);
    this.resetPaymentCapture();
    this.error.set(null);
    this.enrollOpen.set(true);
  }

  openExternalPay(): void {
    this.externalPayNote = '';
    this.resetPaymentCapture();
    this.error.set(null);
    this.externalPayOpen.set(true);
  }

  private resetPaymentCapture(): void {
    this.payMethodId.set(null);
    this.payReference = '';
    this.payerBank.set(null);
    this.payFile = null;
  }

  onPayFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file) {
      const problem = validateFile(file);
      if (problem) {
        this.error.set(problem);
        this.payFile = null;
        return;
      }
    }
    this.error.set(null);
    this.payFile = file;
  }

  /** Clears the chosen receipt and resets the native input so the same file can
   * be re-selected afterwards. */
  clearPayFile(): void {
    this.payFile = null;
    const input = this.payFileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private paymentMeta() {
    return {
      paymentMethodId: this.payMethodId(),
      reference: this.payReference.trim() || null,
      payerBank: this.payerBank(),
    };
  }

  /** After a cobro: attach the receipt (if any) to the primary invoice, then finish. */
  private afterCobro(primaryInvoiceId: string | null, message: string, close: () => void): void {
    const finish = (extra = ''): void => {
      this.saving.set(false);
      close();
      this.renewResult.set(message + extra);
      this.load();
    };
    if (this.payFile && primaryInvoiceId) {
      this.api.uploadInvoiceProof(primaryInvoiceId, this.payFile).subscribe({
        next: () => finish(),
        error: () => finish(' (⚠️ el comprobante no se pudo subir; adjúntalo luego desde Facturación).'),
      });
    } else {
      finish();
    }
  }

  /** Charges membership + tariff to a driver registered without payment, so he
   * can then be approved. Advance ×N weeks allowed. Reuses the enroll endpoint. */
  enroll(): void {
    const plan = this.weeklyPlan();
    if (!plan || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.enroll(this.id(), plan.id, this.enrollPeriods(), this.paymentMeta()).subscribe({
      next: (r) =>
        this.afterCobro(
          r.primaryInvoiceId,
          `Pago registrado. Factura(s): N° ${r.invoiceNumbers.join(', N° ')}. Ya puedes aprobar al afiliado.`,
          () => this.enrollOpen.set(false),
        ),
      error: (err: HttpErrorResponse) => {
        this.enrollOpen.set(false);
        this.fail(err);
      },
    });
  }

  toggleSuspension(): void {
    const d = this.driver();
    if (!d || this.saving()) return;
    this.saving.set(true);
    this.api
      .update(this.id(), { status: d.status === 'suspended' ? 'approved' : 'suspended' })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.load();
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  /** Administrative pause (licencia): freezes the tariff. Backend requires the
   * tariff to be up to date; a business error surfaces via `fail`. */
  pause(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.pause(this.id()).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Registers money received outside the system: settles arrears + penalty. */
  registerExternalPayment(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .registerExternalPayment(this.id(), this.externalPayNote.trim() || null, this.paymentMeta())
      .subscribe({
        next: (r) =>
          this.afterCobro(
            r.primaryInvoiceId,
            `Pago externo registrado: ${r.settledCharges} cargo(s) saldado(s) por $${r.totalUsd}. Factura N° ${r.invoiceNumber}.`,
            () => this.externalPayOpen.set(false),
          ),
        error: (err: HttpErrorResponse) => {
          this.externalPayOpen.set(false);
          this.fail(err);
        },
      });
  }

  /** Manual reactivation: back on the road now instead of waiting the anchor day. */
  reactivate(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.reactivate(this.id()).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Lifts the pause: back to approved + available, tariff resumes running. */
  resume(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.resume(this.id()).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Undoes a programmed plan change (refunds its periods, voids invoices). */
  cancelScheduledChange(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.cancelScheduledChange(this.id()).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.cancelChangeOpen.set(false);
        this.renewResult.set(
          `Cambio de tarifa cancelado: ${result.refundedPayments} pago(s) reembolsado(s) y ${result.voidedInvoices} factura(s) anulada(s).`,
        );
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.cancelChangeOpen.set(false);
        this.fail(err);
      },
    });
  }

  readonly downloadingDocId = signal<string | null>(null);

  /** Human name for a vehicle's type id (Pro vehicle card). */
  vehicleTypeName(id: number | null): string {
    return this.vehicleTypes().find((t) => t.id === id)?.name ?? 'Sin definir';
  }

  /** Opens the private file in a new tab through a short-lived signed URL. */
  openFile(documentId: string): void {
    this.error.set(null);
    this.documentsApi.fileUrl(documentId).subscribe({
      next: ({ url }) => window.open(url, '_blank', 'noopener'),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Downloads the private file: signed URL -> blob -> save with a readable name. */
  downloadFile(doc: DriverDocument): void {
    if (this.downloadingDocId()) return;
    this.error.set(null);
    this.downloadingDocId.set(doc.id);
    this.documentsApi.fileUrl(doc.id).subscribe({
      next: async ({ url }) => {
        try {
          const blob = await (await fetch(url)).blob();
          const ext = doc.fileUrl?.split('.').pop()?.split('?')[0] ?? 'bin';
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${doc.requirementName}.${ext}`.replace(/\s+/g, '-');
          anchor.click();
          URL.revokeObjectURL(objectUrl);
        } catch {
          this.error.set('No se pudo descargar el archivo. Usa «Ver» y descárgalo desde ahí.');
        } finally {
          this.downloadingDocId.set(null);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.downloadingDocId.set(null);
        this.fail(err);
      },
    });
  }

  /** Attaches (or replaces) the file of an already registered document. */
  uploadFile(event: Event, documentId: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const problem = validateFile(file);
    if (problem) {
      this.error.set(problem);
      input.value = '';
      return;
    }

    this.error.set(null);
    this.uploadingDocId.set(documentId);
    this.documentsApi.uploadFile(documentId, file).subscribe({
      next: () => {
        this.uploadingDocId.set(null);
        input.value = '';
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.uploadingDocId.set(null);
        input.value = '';
        this.fail(err);
      },
    });
  }

  openAddVehicle(): void {
    this.vehicleForm = { vehicleTypeId: null, brand: '', model: '', year: null, color: '', plate: '' };
    this.error.set(null);
    this.addVehicleOpen.set(true);
  }

  /** Registers a vehicle from the profile (admin-registered = approved). */
  addVehicle(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .addVehicle(this.id(), {
        vehicleTypeId: this.vehicleForm.vehicleTypeId,
        brand: this.vehicleForm.brand.trim() || null,
        model: this.vehicleForm.model.trim() || null,
        year: this.vehicleForm.year,
        color: this.vehicleForm.color.trim() || null,
        plate: this.vehicleForm.plate.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.addVehicleOpen.set(false);
          this.load();
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  openAddDocument(): void {
    this.docRequirementId = null;
    this.docExpiresAt = '';
    this.docFile = null;
    this.error.set(null);
    this.addDocOpen.set(true);
  }

  onDocFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) {
      this.docFile = null;
      return;
    }
    const problem = validateFile(file);
    if (problem) {
      this.error.set(problem);
      this.docFile = null;
      const input = this.docFileInput()?.nativeElement;
      if (input) input.value = '';
      return;
    }
    this.error.set(null);
    this.docFile = file;
  }

  /** Registers the document metadata, then attaches its file (optional). */
  addDocument(): void {
    if (!this.docRequirementId || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const file = this.docFile;
    this.api
      .addDocument(this.id(), {
        requirementId: this.docRequirementId,
        expiresAt: this.docExpiresAt || null,
      })
      .pipe(
        switchMap((doc) =>
          file ? this.documentsApi.uploadFile(doc.id, file).pipe(map(() => doc)) : of(doc),
        ),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.addDocOpen.set(false);
          this.load();
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  /** Initials for the header avatar chip (Pro profile pattern). */
  initials(): string {
    const parts = (this.driver()?.fullName ?? '').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  backToList(): void {
    void this.router.navigate(['/drivers']);
  }

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
    );
  }
}
