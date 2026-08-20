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
import { FileViewer } from '../../shared/components/file-viewer';
import { DocumentFileService } from '../documents/document-file.service';
import { Avatar } from '../../shared/components/avatar';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { RejectPrompt } from '../documents/reject-prompt';
import { ReviewPromptService, type ReviewTarget } from '../documents/review-prompt.service';

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
  imports: [DatePipe, NgTemplateOutlet, RouterLink, FormsModule, FileViewer, BusyDirective, Avatar, RejectPrompt],
  templateUrl: './request-detail.html',
})
export class RequestDetail implements OnInit {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);
  /** Same viewer the affiliate detail uses: one implementation, not two. */
  protected readonly files = inject(DocumentFileService);
  /** Approve/reject shared with the affiliate profile and the vehicle page. */
  protected readonly review = inject(ReviewPromptService);
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

  // ── Per-item review ──
  //
  // Delegated to ReviewPromptService, the same one the affiliate profile and the
  // vehicle page use. This screen carried its OWN copy — verdict, modal, reason
  // and all — which is exactly the third copy that service was created to remove.
  //
  // A verdict patches the row IN PLACE. Reloading sent the solicitud back to
  // "Cargando…" and scrolled to the top, and reviewing an applicant means
  // approving five or six items in a row.

  approveDocument(doc: DriverDocument): void {
    this.review.approveDocument(
      doc.id,
      () => this.patchDocument(doc.id, 'approved', null),
      (err) => this.fail(err),
    );
  }

  approveVehicle(v: DriverVehicle): void {
    this.review.approveVehicle(
      this.id(),
      v.id,
      () => this.patchVehicle(v.id, 'approved', null),
      (err) => this.fail(err),
    );
  }

  onRejected(target: ReviewTarget, reason: string): void {
    if (target.kind === 'document') {
      this.patchDocument(target.id, 'rejected', reason);
    } else {
      this.patchVehicle(target.id, 'rejected', reason);
    }
  }

  private patchDocument(
    id: string,
    approvalStatus: 'approved' | 'rejected',
    rejectionReason: string | null,
  ): void {
    this.driver.update((d) =>
      d
        ? {
            ...d,
            documents: d.documents.map((doc) =>
              doc.id === id ? { ...doc, approvalStatus, rejectionReason } : doc,
            ),
          }
        : d,
    );
  }

  private patchVehicle(
    id: string,
    approvalStatus: 'approved' | 'rejected',
    rejectionReason: string | null,
  ): void {
    this.driver.update((d) =>
      d
        ? {
            ...d,
            vehicles: d.vehicles.map((v) =>
              v.id === id ? { ...v, approvalStatus, rejectionReason } : v,
            ),
          }
        : d,
    );
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

  private fail(err: HttpErrorResponse): void {
    this.saving.set(false);
    this.error.set(this.msg(err));
  }

  private msg(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
