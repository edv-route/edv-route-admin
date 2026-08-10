import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of, type Observable } from 'rxjs';
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
import { Toggle } from '../../shared/components/toggle';
import { INPUT_FILTERS } from '../../shared/directives/input-filters';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { DocumentsApi, validateFile } from '../documents/documents.api';
import { PaymentSubmissionsApi } from '../billing/payment-submissions.api';
import { BillingApi } from '../billing/billing.api';
import type { InvoiceListItem } from '../../core/models/billing.model';
import { DriversApi } from './drivers.api';
import { PaymentCapture, type PaymentCaptureValue, emptyPaymentCapture } from './payment-capture';
import { VehicleForm } from './vehicle-form';
import { DriverStatusCard } from './driver-status-card';
import { DriverTariffCard } from './driver-tariff-card';
import {
  NATIONAL_ID_OPTIONS,
  PHONE_COUNTRY_OPTIONS,
  PHONE_OPERATOR_OPTIONS,
  composePerson,
  emptyPersonForm,
  maxBirthDate,
  parseNationalId,
  parsePhone,
} from './person-form';

/** One-click important actions gated behind a confirmation modal. */
type ImportantAction = 'suspend' | 'pause' | 'resume' | 'reactivate';

/** Full-width tabs of the affiliate profile. */
type ProfileTab = 'personal' | 'vehicles' | 'documents';

interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  action: ImportantAction;
}

@Component({
  selector: 'app-driver-detail',
  imports: [FormsModule, DatePipe, RouterLink, Select, ...INPUT_FILTERS, PasswordInput, DatePicker, PaymentCapture, FileViewer, VehicleForm, Toggle, DriverStatusCard, DriverTariffCard, BusyDirective],
  templateUrl: './driver-detail.html',
})
export class DriverDetail {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly submissionsApi = inject(PaymentSubmissionsApi);
  private readonly billingApi = inject(BillingApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly statusLabels = DRIVER_STATUS_LABELS;

  readonly driver = signal<DriverDetailModel | null>(null);
  readonly requirements = signal<Requirement[]>([]);
  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly editOpen = signal(false);
  /** Active full-width profile tab. */
  readonly activeTab = signal<ProfileTab>('personal');
  readonly tabs: { id: ProfileTab; label: string }[] = [
    { id: 'personal', label: 'Datos personales' },
    { id: 'vehicles', label: 'Vehículos' },
    { id: 'documents', label: 'Documentos' },
  ];
  readonly confirmAction = signal<'approve' | 'reject' | null>(null);
  /** Approve modal: chosen start mode (step 1) and whether we're on the confirm step. */
  readonly approveMode = signal<'now' | 'next_monday' | null>(null);
  readonly approveConfirming = signal(false);
  /** Generic confirmation modal for one-click important actions. */
  readonly confirm = signal<ConfirmDialog | null>(null);
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
  /** Debt invoices of the driver + which are selected for a partial payment. */
  readonly debtInvoices = signal<InvoiceListItem[]>([]);
  readonly selectedInvoiceIds = signal<Set<string>>(new Set());
  /** Optional note (constancia) for the "Generar pago" modal, e.g. part in cash. */
  renewNote = '';
  /** Post-registration charge (membership + tariff) for a driver without payment. */
  readonly enrollOpen = signal(false);
  readonly enrollPeriods = signal(1);
  readonly membership = signal<{ id: number; name: string; priceUsd: string } | null>(null);
  /** Payment capture shared by the enroll, renewal and external-payment modals (Pieza 2). */
  readonly payment = signal<PaymentCaptureValue>(emptyPaymentCapture());
  /** Admin toggle: approve the payment on the spot instead of leaving it pending.
   *  Shared by the enroll / renew / external-payment modals; reset on each open. */
  readonly autoApprove = signal(false);
  readonly periodLabels = BILLING_PERIOD_LABELS;

  // Fleet + documents are living data managed here (moved out of the alta,
  // decision 2026-07-21). Both reuse the existing driver sub-endpoints.
  readonly addVehicleOpen = signal(false);
  readonly addDocOpen = signal(false);
  docRequirementId: number | null = null;
  docFile: File | null = null;
  docFileName: string | null = null;

  person = emptyPersonForm();
  readonly maxBirthDate = maxBirthDate();
  readonly nationalIdOptions = NATIONAL_ID_OPTIONS;
  readonly phoneCountryOptions = PHONE_COUNTRY_OPTIONS;
  readonly phoneOperatorOptions = PHONE_OPERATOR_OPTIONS;
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

  /** Driver-owned documents shown in the Documentos tab (vehicle docs live in the vehicle detail screen). */
  readonly driverDocuments = computed(() =>
    (this.driver()?.documents ?? []).filter((doc) => doc.appliesTo === 'driver'),
  );

  /** Whether the driver owes money (alta debt, arrears or membership): drives the
   *  single adaptive payment button and the red debt band. */
  readonly hasDebt = computed(() => Number(this.driver()?.debt.totalUsd ?? 0) > 0);

  /** v9: a payment awaiting admin review — hides the pay button, shows "en revisión". */
  readonly pendingSubmission = computed(() => this.driver()?.pendingSubmission ?? null);
  /** v9: the last submission was rejected and none newer — drives the rejection message. */
  readonly rejectedSubmission = computed(() =>
    this.pendingSubmission() ? null : (this.driver()?.rejectedSubmission ?? null),
  );

  /** v9 partial-payment split — the debt invoices the pending payment covers.
   *  Empty when it covers the whole debt (or is not a partial debt payment). */
  readonly coveredInvoiceIds = computed(() => new Set(this.pendingSubmission()?.invoiceIds ?? []));
  /** The pending payment covers the WHOLE debt: single "en revisión" band, no red one. */
  readonly pendingCoversAll = computed(
    () => !!this.pendingSubmission() && this.coveredInvoiceIds().size === 0,
  );
  /** Tariff/penalty charges NOT covered by the pending payment (still owed). When
   *  the pending payment covers the whole debt there is no remainder. */
  readonly owedCharges = computed(() => {
    const d = this.driver();
    if (!d || this.pendingCoversAll()) return [];
    const covered = this.coveredInvoiceIds();
    return d.debt.charges.filter((c) => !(c.invoiceId && covered.has(c.invoiceId)));
  });
  /** Membership debt still owed (0 when the pending payment already covers it). */
  readonly owedMembershipDue = computed(() => {
    const d = this.driver();
    if (!d || this.pendingCoversAll() || Number(d.debt.membershipDue) <= 0) return '0';
    const id = d.debt.membershipInvoiceId;
    return id && this.coveredInvoiceIds().has(id) ? '0' : d.debt.membershipDue;
  });
  /** Total still owed once the pending payment settles what it covers. */
  readonly owedTotal = computed(() =>
    (
      this.owedCharges().reduce((sum, c) => sum + Number(c.amountUsd), 0) +
      Number(this.owedMembershipDue())
    ).toFixed(2),
  );
  /** Whether any debt remains after the pending payment is approved. */
  readonly hasRemainingDebt = computed(
    () => this.owedCharges().length > 0 || Number(this.owedMembershipDue()) > 0,
  );
  /** The membership debt invoice in the external-pay picker (always first + locked). */
  readonly membershipInvoice = computed(
    () => this.debtInvoices().find((i) => i.kind === 'membership') ?? null,
  );

  /**
   * What the debt modal settles: the alta debt (membership + first week), overdue
   * tariff weeks and the penalty, all in one (todo-o-nada). Drives the breakdown,
   * the per-line list and the total. Null with no driver.
   */
  readonly paySummary = computed(() => {
    const d = this.driver();
    if (!d) return null;
    const list = [...d.debt.charges];
    const membershipDue = Number(d.debt.membershipDue ?? 0);
    const periods = list.filter((c) => c.kind === 'period');
    const weeksUsd = periods.reduce((sum, c) => sum + Number(c.amountUsd), 0);
    const penaltyUsd = list
      .filter((c) => c.kind === 'penalty')
      .reduce((sum, c) => sum + Number(c.amountUsd), 0);
    const pricePerWeek = periods.length ? weeksUsd / periods.length : Number(d.subscription?.priceUsd ?? 0);
    return {
      list,
      membershipDue: membershipDue.toFixed(2),
      hasMembership: membershipDue > 0,
      weeks: periods.length,
      pricePerWeek: pricePerWeek.toFixed(2),
      weeksUsd: weeksUsd.toFixed(2),
      penaltyUsd: penaltyUsd.toFixed(2),
      hasPenalty: penaltyUsd > 0,
      total: (weeksUsd + penaltyUsd + membershipDue).toFixed(2),
    };
  });

  /** Availability badge next to the name: "Activo" only for drivers that can
   *  actually operate (approved/overdue) AND are available. Everyone else — not
   *  yet approved, paused, penalized, suspended, rejected — is "Inactivo". The
   *  lifecycle status itself lives solely in the Estado card, never by the name. */
  readonly isActive = computed(() => {
    const d = this.driver();
    return !!d && d.isAvailable && (d.status === 'approved' || d.status === 'overdue');
  });

  /** Active catalog for the plan-change picker (archived ones are excluded). */
  readonly activePlans = computed(() => this.plans().filter((p) => p.active));

  /** app-select options (branded dropdown; native <select> is not used). */
  readonly docRequirementOptions = computed<SelectOption[]>(() =>
    this.missingRequirements().map((r) => ({
      value: r.id,
      label: r.isRequired ? `${r.name} *` : r.name,
    })),
  );
  readonly vehicleTypeOptions = computed<SelectOption[]>(() =>
    this.vehicleTypes().map((t) => ({ value: t.id, label: t.name })),
  );
  /** First option ("renew current", value = current plan id) is mapped back to
   *  null on change; the rest are plan changes. Preserves the renewPlanId contract. */
  readonly renewPlanOptions = computed<SelectOption[]>(() => {
    const sub = this.driver()?.subscription;
    if (!sub) return [];
    const options: SelectOption[] = [
      { value: sub.planId, label: `Renovar la actual — ${sub.planName ?? ''}` },
    ];
    for (const p of this.activePlans()) {
      if (p.id !== sub.planId) {
        options.push({
          value: p.id,
          label: `Cambiar a: ${p.name} ($${p.priceUsd} · ${this.periodLabels[p.billingPeriod]})`,
        });
      }
    }
    return options;
  });

  /** With a single tariff available there is nothing to choose: the picker stays
   *  preselected on the current plan and locked (disabled). */
  readonly singleRenewOption = computed(() => this.renewPlanOptions().length <= 1);

  readonly selectedPlan = computed(() =>
    this.plans().find((p) => p.id === this.renewPlanId()) ?? null,
  );

  /** Dynamic charge summary of the renew/advance modal: the plan being charged
   *  (the current one, or the chosen change), its unit price and total × periods. */
  readonly renewCharge = computed(() => {
    const sub = this.driver()?.subscription;
    const changed = this.selectedPlan(); // null when renewing the current plan
    const name = changed?.name ?? sub?.planName ?? 'Tarifa';
    const price = Number(changed?.priceUsd ?? sub?.priceUsd ?? 0);
    const periods = this.renewPeriods();
    return { name, price: price.toFixed(2), periods, total: (price * periods).toFixed(2) };
  });

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
    const phone = parsePhone(d.phone);
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
      phoneOperator: phone.operator,
      phoneNumber: phone.number,
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

  /** Confirms a rejection. Approval goes through confirmApprove() (needs a start mode). */
  runAction(): void {
    if (this.confirmAction() !== 'reject' || this.saving()) return;
    this.saving.set(true);
    this.api.reject(this.id()).subscribe({
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

  /** Opens the approve modal on its selection step (resets the chosen mode). */
  openApprove(): void {
    this.approveMode.set(null);
    this.approveConfirming.set(false);
    this.confirmAction.set('approve');
  }

  /** Closes the approve modal (blocked while the request is in flight). */
  closeApprove(): void {
    if (this.saving()) return;
    this.resetApprove();
  }

  /** Step 1 → step 2: move to the confirmation once a start mode is chosen. */
  continueApprove(): void {
    if (this.approveMode()) this.approveConfirming.set(true);
  }

  /**
   * Step 2: approves the alta with the chosen start mode — `now` (operate today,
   * tariff anchored to this week's Monday, loses elapsed days) or `next_monday`
   * (driver left `scheduled`; tariff starts next Monday). The confirm button stays
   * in its loading state until the modal closes (success) or the request fails.
   */
  confirmApprove(): void {
    const startMode = this.approveMode();
    if (!startMode || this.saving()) return;
    this.saving.set(true);
    this.api.approve(this.id(), startMode).subscribe({
      next: () => {
        this.saving.set(false);
        this.resetApprove();
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.resetApprove();
        this.fail(err);
      },
    });
  }

  private resetApprove(): void {
    this.confirmAction.set(null);
    this.approveConfirming.set(false);
    this.approveMode.set(null);
  }

  /** The FOLLOWING Monday — always next week, even when today is Monday (so
   *  "Empezar ya" covers this Monday). Matches the backend "próximo lunes" anchor. */
  nextMonday(): Date {
    const d = new Date();
    const sinceMonday = (d.getDay() + 6) % 7; // days since this week's Monday
    d.setDate(d.getDate() - sinceMonday + 7); // this week's Monday + 7 = next Monday
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** True when today is Monday: "Empezar ya" then starts today with the full week,
   *  so its note drops the "loses days" line. */
  isMonday(): boolean {
    return new Date().getDay() === 1;
  }

  /** Opens the generic confirmation modal for an important action. */
  askConfirm(dialog: ConfirmDialog): void {
    this.error.set(null);
    this.confirm.set(dialog);
  }

  /** Dispatches the confirmed action; the modal closes when the request finishes. */
  runConfirm(): void {
    const dialog = this.confirm();
    if (!dialog || this.saving()) return;
    switch (dialog.action) {
      case 'suspend':
        this.toggleSuspension();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'reactivate':
        this.reactivate();
        break;
    }
  }

  /** Runs a confirmed request: loading on; close the modal + reload on success. */
  private runConfirmed(request: Observable<unknown>): void {
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.confirm.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.confirm.set(null);
        this.fail(err);
      },
    });
  }

  openRenew(): void {
    this.renewPeriods.set(1);
    this.renewPlanId.set(null);
    this.renewResult.set(null);
    this.renewNote = '';
    this.resetPaymentCapture();
    this.autoApprove.set(false);
    this.error.set(null);
    this.renewOpen.set(true);
  }

  renew(): void {
    if (this.saving()) return;
    const planId = this.renewPlanId();
    const isPlanChange = planId != null && planId !== this.driver()?.subscription?.planId;

    // The modal button already gates on the capture's `complete()` (which makes the
    // receipt optional for Efectivo Divisa). Simple renewal / advance → PENDING
    // submission (purpose=advance); a different plan → purpose=change_plan.
    if (!isPlanChange) {
      const form = this.buildSubmissionForm('advance', this.renewNote.trim() || null, this.renewPeriods());
      this.submitPayment(form, () => this.renewOpen.set(false));
      return;
    }

    const form = this.buildSubmissionForm('change_plan', this.renewNote.trim() || null, this.renewPeriods());
    if (planId != null) form.set('planId', String(planId));
    this.submitPayment(form, () => this.renewOpen.set(false));
  }

  openEnroll(): void {
    this.enrollPeriods.set(1);
    this.resetPaymentCapture();
    this.autoApprove.set(false);
    this.error.set(null);
    this.enrollOpen.set(true);
  }

  openExternalPay(): void {
    this.externalPayNote = '';
    this.resetPaymentCapture();
    this.autoApprove.set(false);
    this.error.set(null);
    // Load the driver's debt invoices (issued/overdue) for the partial-payment
    // selection; all are selected by default (settle everything). The membership
    // invoice is forced first and stays selected (it cannot be unchecked).
    this.billingApi.invoices({ driverId: this.id(), page: 1, limit: 100 }).subscribe({
      next: (result) => {
        const owed = result.items
          .filter((i) => i.status === 'issued' || i.status === 'overdue')
          .sort((a, b) => Number(b.kind === 'membership') - Number(a.kind === 'membership'));
        this.debtInvoices.set(owed);
        this.selectedInvoiceIds.set(new Set(owed.map((i) => i.id)));
      },
      error: () => {
        this.debtInvoices.set([]);
        this.selectedInvoiceIds.set(new Set());
      },
    });
    this.externalPayOpen.set(true);
  }

  /** Toggles a debt invoice in/out of the partial-payment selection. The membership
   *  invoice is mandatory: it stays selected and cannot be toggled off. */
  toggleInvoice(id: string): void {
    if (id === this.membershipInvoice()?.id) return;
    this.selectedInvoiceIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Total of the selected debt invoices (each paid in full). */
  readonly selectedDebtTotal = computed(() =>
    this.debtInvoices()
      .filter((i) => this.selectedInvoiceIds().has(i.id))
      .reduce((sum, i) => sum + Number(i.totalUsd), 0)
      .toFixed(2),
  );

  private resetPaymentCapture(): void {
    this.payment.set(emptyPaymentCapture());
  }

  private paymentMeta() {
    const p = this.payment();
    return {
      paymentMethodId: p.paymentMethodId,
      reference: p.reference,
      payerBank: p.payerBank,
      paidOn: p.paidOn,
      payerPhone: p.payerPhone,
      payerId: p.payerId,
      payerAccount: p.payerAccount,
    };
  }

  /** Charges membership + tariff to a driver registered without payment, so he
   * can then be approved. Advance ×N weeks allowed. Reuses the enroll endpoint. */
  enroll(): void {
    if (this.saving()) return;
    // The modal button gates on the capture's `complete()` (receipt optional for
    // Efectivo Divisa). Enroll = membership + N weeks in ONE invoice on approval.
    const form = this.buildSubmissionForm('enroll', null, this.enrollPeriods());
    this.submitPayment(form, () => this.enrollOpen.set(false));
  }

  toggleSuspension(): void {
    const d = this.driver();
    if (!d) return;
    this.runConfirmed(
      this.api.update(this.id(), { status: d.status === 'suspended' ? 'approved' : 'suspended' }),
    );
  }

  /** Administrative pause (licencia): freezes the tariff. Backend requires the
   * tariff to be up to date; a business error surfaces via `fail`. */
  pause(): void {
    this.runConfirmed(this.api.pause(this.id()));
  }

  /** Builds the multipart body of a submission from the captured payment
   *  (1 receipt, or up to 5 bill photos + amount for Efectivo Divisa). */
  private buildSubmissionForm(
    purpose: 'debt' | 'advance' | 'enroll' | 'change_plan',
    note: string | null,
    periods?: number,
  ): FormData {
    const p = this.payment();
    const form = new FormData();
    form.set('purpose', purpose);
    if (periods) form.set('periods', String(periods));
    if (p.paymentMethodId != null) form.set('paymentMethodId', String(p.paymentMethodId));
    if (p.reference) form.set('reference', p.reference);
    if (p.payerBank) form.set('payerBank', p.payerBank);
    if (p.paidOn) form.set('paidOn', p.paidOn);
    if (p.payerPhone) form.set('payerPhone', p.payerPhone);
    if (p.payerId) form.set('payerId', p.payerId);
    if (p.payerAccount) form.set('payerAccount', p.payerAccount);
    if (note) form.set('note', note);
    // Admin "approve immediately" toggle: liquidate the payment on the spot.
    if (this.autoApprove()) form.set('autoApprove', 'true');
    for (const f of p.files) form.append('files', f, f.name);
    return form;
  }

  /** Sends a submission (multipart) and reports it as pending on success. */
  private submitPayment(form: FormData, close: () => void): void {
    this.saving.set(true);
    this.error.set(null);
    this.submissionsApi.create(this.id(), form).subscribe({
      next: (res) => {
        this.saving.set(false);
        close();
        this.renewResult.set(
          res.approved
            ? 'Pago registrado y aprobado. Las facturas quedaron pagadas.'
            : 'Pago enviado. Queda pendiente de aprobación por un administrador.',
        );
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        close();
        this.fail(err);
      },
    });
  }

  /**
   * Registers a payment against the driver's debt (v9): creates a PENDING
   * submission (with the receipt) reviewed from Facturación → "Por aprobar",
   * instead of settling on the spot.
   */
  registerExternalPayment(): void {
    if (this.saving()) return;
    const selected = [...this.selectedInvoiceIds()];
    if (selected.length === 0) {
      this.error.set('Selecciona al menos una factura por pagar.');
      return;
    }
    // Partial payment: the receipt settles exactly the selected debt invoices
    // (each in full); the button gates on the capture's `complete()`.
    const form = this.buildSubmissionForm('debt', this.externalPayNote.trim() || null);
    form.set('invoiceIds', selected.join(','));
    this.submitPayment(form, () => this.externalPayOpen.set(false));
  }

  /** Manual reactivation: back on the road now instead of waiting the anchor day. */
  reactivate(): void {
    this.runConfirmed(this.api.reactivate(this.id()));
  }

  /** Lifts the pause: back to approved + available, tariff resumes running. */
  resume(): void {
    this.runConfirmed(this.api.resume(this.id()));
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
  readonly deletingDocId = signal<string | null>(null);

  /** Human name for a vehicle's type id (Pro vehicle card). */
  vehicleTypeName(id: number | null): string {
    return this.vehicleTypes().find((t) => t.id === id)?.name ?? 'Sin definir';
  }

  /** File shown in the modal viewer (null = closed). */
  readonly viewer = signal<FileViewerState | null>(null);

  /** Opens the private file in the modal viewer through a short-lived signed URL. */
  openFile(doc: DriverDocument): void {
    const title = doc.requirementName;
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.documentsApi.fileUrl(doc.id).subscribe({
      next: ({ url }) => this.viewer.set({ title, url, loading: false, error: null }),
      error: (err: HttpErrorResponse) =>
        this.viewer.set({
          title,
          url: null,
          loading: false,
          error:
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        }),
    });
  }

  /** Removes a document (driver or vehicle) and reloads the profile. */
  deleteDocument(doc: DriverDocument): void {
    if (this.deletingDocId()) return;
    this.error.set(null);
    this.deletingDocId.set(doc.id);
    this.documentsApi.delete(doc.id).subscribe({
      next: () => {
        this.deletingDocId.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.deletingDocId.set(null);
        this.fail(err);
      },
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
    this.error.set(null);
    this.addVehicleOpen.set(true);
  }

  /** The add-vehicle dialog finished (vehicle + photos + documents created). */
  onVehicleSaved(): void {
    this.addVehicleOpen.set(false);
    this.load();
  }

  openAddDocument(): void {
    this.docRequirementId = null;
    this.docFile = null;
    this.docFileName = null;
    this.error.set(null);
    this.addDocOpen.set(true);
  }

  onDocFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) {
      const problem = validateFile(file);
      if (problem) {
        this.error.set(problem);
        return;
      }
    }
    this.error.set(null);
    this.docFile = file;
    this.docFileName = file?.name ?? null;
  }

  clearDocFile(): void {
    this.docFile = null;
    this.docFileName = null;
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
        expiresAt: null,
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
