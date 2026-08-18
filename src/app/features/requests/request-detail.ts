import { Component, type OnInit, computed, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DriverDetail, DriverDocument, DriverVehicle } from '../../core/models/driver.model';
import type { Requirement } from '../../core/models/requirement.model';
import { DriversApi } from '../drivers/drivers.api';
import { DocumentsApi } from '../documents/documents.api';
import { RequirementsApi } from '../requirements/requirements.api';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { Avatar } from '../../shared/components/avatar';
import { BusyDirective } from '../../shared/directives/busy.directive';

/** Reject-with-reason target: a document or a vehicle of the solicitud. */
interface RejectTarget {
  kind: 'document' | 'vehicle';
  id: string;
  label: string;
}

/**
 * Solicitud detail (solicitudes-app): the admin reviews an app applicant —
 * personal data + documents + vehicles — approving/rejecting EACH one (rejection
 * carries a reason the applicant sees to fix it). No money here: applicants have
 * no debt/tariff. The solicitud can be approved only once every document and
 * vehicle is approved; the backend also enforces requirement completeness + >=1
 * vehicle. Approving promotes the applicant to an affiliate (with base debt).
 */
@Component({
  selector: 'app-request-detail',
  imports: [DatePipe, NgTemplateOutlet, RouterLink, FormsModule, FileViewer, BusyDirective, Avatar],
  templateUrl: './request-detail.html',
})
export class RequestDetail implements OnInit {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly requirementsApi = inject(RequirementsApi);

  readonly id = input.required<string>();

  readonly driver = signal<DriverDetail | null>(null);
  /** Active requirement catalog — needed to mirror the backend completeness gate. */
  readonly requirements = signal<Requirement[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  /** Banner shown after approving/rejecting the whole solicitud. */
  readonly notice = signal<string | null>(null);

  /** Private file shown in the modal viewer (null = closed). */
  readonly viewer = signal<FileViewerState | null>(null);

  /** Reject-with-reason modal (document or vehicle); null = closed. */
  readonly rejectTarget = signal<RejectTarget | null>(null);
  rejectReason = '';

  /** Confirmation of approving / rejecting / reopening the whole solicitud. */
  readonly confirm = signal<'approve' | 'reject' | 'reopen' | null>(null);

  constructor() {
    // The requirement catalog is stable and independent of the id; load it once
    // to gate approval exactly like the backend (every required requirement
    // covered by an approved doc).
    this.requirementsApi.list().subscribe({
      next: (reqs) => this.requirements.set(reqs),
    });
  }

  ngOnInit(): void {
    // `id` is a REQUIRED input: it only has a value AFTER construction, so the
    // detail load must run here — reading `this.id()` in the constructor throws
    // NG0950 ("Input id is required but no value is available yet").
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
        this.error.set(this.msg(err));
      },
    });
  }

  /** Documents owned directly by the driver (not by a vehicle). */
  readonly driverDocuments = computed(() =>
    (this.driver()?.documents ?? []).filter((doc) => doc.appliesTo === 'driver'),
  );

  /** Documents of a given vehicle. */
  vehicleDocuments(vehicleId: string): DriverDocument[] {
    return (this.driver()?.documents ?? []).filter((doc) => doc.vehicleId === vehicleId);
  }

  /**
   * Mirrors the backend gate (`assertApplicationComplete`): >=1 vehicle, every
   * vehicle approved, no document left unapproved, AND every required requirement
   * (driver + per vehicle) covered by an APPROVED document. Kept in sync so the
   * button is never enabled when `approve-application` would answer 409. Requires
   * the requirement catalog to be loaded (false until then — fail closed).
   */
  readonly canApprove = computed(() => {
    const d = this.driver();
    const reqs = this.requirements();
    if (!d || reqs.length === 0) return false;

    const docsOk = d.documents.every((doc) => doc.approvalStatus === 'approved');
    const vehiclesOk =
      d.vehicles.length > 0 && d.vehicles.every((v) => v.approvalStatus === 'approved');
    if (!docsOk || !vehiclesOk) return false;

    const requiredDriver = reqs.filter((r) => r.appliesTo === 'driver' && r.isRequired && r.active);
    const driverCovered = requiredDriver.every((r) =>
      d.documents.some(
        (doc) =>
          doc.appliesTo === 'driver' &&
          doc.requirementId === r.id &&
          doc.approvalStatus === 'approved',
      ),
    );

    const requiredVehicle = reqs.filter((r) => r.appliesTo === 'vehicle' && r.isRequired && r.active);
    const vehiclesCovered = d.vehicles.every((v) =>
      requiredVehicle.every((r) =>
        d.documents.some(
          (doc) =>
            doc.vehicleId === v.id &&
            doc.requirementId === r.id &&
            doc.approvalStatus === 'approved',
        ),
      ),
    );

    return driverCovered && vehiclesCovered;
  });

  // ── File viewer ──

  openFile(doc: DriverDocument): void {
    if (!doc.fileUrl) return;
    const title = doc.requirementName;
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.documentsApi.fileUrl(doc.id).subscribe({
      next: ({ url }) => this.viewer.set({ title, url, loading: false, error: null }),
      error: (err: HttpErrorResponse) =>
        this.viewer.set({ title, url: null, loading: false, error: this.msg(err) }),
    });
  }

  // ── Per-item review ──

  approveDocument(doc: DriverDocument): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.reviewDocument(doc.id, true).subscribe({
      next: () => this.reloadAfterReview(),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  approveVehicle(v: DriverVehicle): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.reviewVehicle(this.id(), v.id, true).subscribe({
      next: () => this.reloadAfterReview(),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Opens the reject-with-reason modal for a document or a vehicle. */
  openReject(target: RejectTarget): void {
    this.rejectReason = '';
    this.rejectTarget.set(target);
  }

  closeReject(): void {
    if (this.saving()) return;
    this.rejectTarget.set(null);
  }

  confirmReject(): void {
    const target = this.rejectTarget();
    const reason = this.rejectReason.trim();
    if (!target || !reason || this.saving()) return;
    this.saving.set(true);
    const req =
      target.kind === 'document'
        ? this.api.reviewDocument(target.id, false, reason)
        : this.api.reviewVehicle(this.id(), target.id, false, reason);
    req.subscribe({
      next: () => {
        this.rejectTarget.set(null);
        this.reloadAfterReview();
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  // ── Whole solicitud ──

  approveApplication(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.approveApplication(this.id()).subscribe({
      next: () => {
        this.saving.set(false);
        this.confirm.set(null);
        this.notice.set('Solicitud aprobada. El solicitante ya es afiliado (con su deuda de alta).');
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.confirm.set(null);
        this.fail(err);
      },
    });
  }

  rejectApplication(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.rejectApplication(this.id()).subscribe({
      next: () => {
        this.saving.set(false);
        this.confirm.set(null);
        this.notice.set(
          'Solicitud rechazada. Queda archivada; el solicitante no puede volver a registrarse solo — deberá contactar al administrador para reabrirla.',
        );
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.confirm.set(null);
        this.fail(err);
      },
    });
  }

  /** Reopens a rejected solicitud back to review (rejected → applicant). */
  reopenApplication(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.reopenApplication(this.id()).subscribe({
      next: () => {
        this.saving.set(false);
        this.confirm.set(null);
        this.notice.set('Solicitud reabierta. Vuelve a estar en revisión.');
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.confirm.set(null);
        this.fail(err);
      },
    });
  }

  private reloadAfterReview(): void {
    this.saving.set(false);
    this.load();
  }

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(this.msg(err));
  }

  private msg(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
