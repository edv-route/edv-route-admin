import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import {
  IDENTITY_KINDS,
  IDENTITY_KIND_LABELS,
  IDENTITY_REJECT_REASONS,
  type IdentityKind,
  type IdentityPhoto,
  type IdentityView,
} from '../../core/models/identity.model';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { IdentityApi } from './identity.api';

/** What the person declared, shown beside the photos to compare. */
export interface DeclaredIdentity {
  fullName: string;
  nationalId: string | null;
  birthDate: string | null;
}

const OTHER = 'Otro motivo';

/**
 * "Verificación de identidad" (mockups 11 and 12, approved 2026-11-12): the
 * three photos of a person with the office's verdict on each.
 *
 * - **driver** mode: approve or reject each photo; an approved one can still be
 *   revoked. Only an approved identity works once the rule is on.
 * - **client** mode: no approval for passengers — only "pedir otra foto".
 *
 * Owns its data (one GET) and tells the host what it loaded, so the affiliate
 * profile can gate the approval of a solicitud on it.
 */
@Component({
  selector: 'app-identity-review',
  imports: [DatePipe, FormsModule, FileViewer, BusyDirective],
  templateUrl: './identity-review.html',
})
export class IdentityReview {
  private readonly api = inject(IdentityApi);

  readonly userId = input.required<string>();
  readonly mode = input<'driver' | 'client'>('driver');
  readonly declared = input<DeclaredIdentity | null>(null);
  readonly loaded = output<IdentityView>();

  readonly view = signal<IdentityView | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busyPhotoId = signal<string | null>(null);
  readonly viewer = signal<FileViewerState | null>(null);

  /** The photo being rejected (the reasons dialog is open). */
  readonly rejecting = signal<IdentityPhoto | null>(null);
  reasonChoice = '';
  otherReason = '';
  readonly rejectError = signal<string | null>(null);
  readonly other = OTHER;

  readonly kinds = IDENTITY_KINDS;
  readonly labels = IDENTITY_KIND_LABELS;

  readonly byKind = computed(() => {
    const map = new Map<IdentityKind, IdentityPhoto>();
    for (const p of this.view()?.photos ?? []) map.set(p.kind, p);
    return map;
  });

  readonly pendingCount = computed(
    () => (this.view()?.photos ?? []).filter((p) => p.status === 'pending').length,
  );

  readonly reasons = computed(() => {
    const photo = this.rejecting();
    return photo ? [...IDENTITY_REJECT_REASONS[photo.kind], OTHER] : [];
  });

  constructor() {
    effect(() => this.load(this.userId()));
  }

  load(userId: string = this.userId()): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.get(userId).subscribe({
      next: (view) => this.apply(view),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.message(err));
      },
    });
  }

  approve(photo: IdentityPhoto): void {
    if (this.busyPhotoId()) return;
    this.busyPhotoId.set(photo.id);
    this.error.set(null);
    this.api.approve(photo.id).subscribe({
      next: (view) => this.apply(view),
      error: (err: HttpErrorResponse) => this.failAction(err),
    });
  }

  openReject(photo: IdentityPhoto): void {
    this.reasonChoice = '';
    this.otherReason = '';
    this.rejectError.set(null);
    this.rejecting.set(photo);
  }

  closeReject(): void {
    if (this.busyPhotoId()) return;
    this.rejecting.set(null);
  }

  confirmReject(form: NgForm): void {
    const photo = this.rejecting();
    if (!photo || this.busyPhotoId()) return;
    if (form.invalid) {
      form.control.markAllAsTouched();
      this.rejectError.set(this.reasonChoice ? 'Escribe el motivo.' : 'Elige el motivo del rechazo.');
      return;
    }
    const reason = this.reasonChoice === OTHER ? this.otherReason.trim() : this.reasonChoice;
    this.busyPhotoId.set(photo.id);
    this.rejectError.set(null);
    this.api.reject(photo.id, reason).subscribe({
      next: (view) => {
        this.rejecting.set(null);
        this.apply(view);
      },
      error: (err: HttpErrorResponse) => {
        this.busyPhotoId.set(null);
        this.rejectError.set(this.message(err));
      },
    });
  }

  /**
   * The links live two minutes: enlarging asks the API for a fresh one rather
   * than trusting the link the list was painted with.
   */
  openPhoto(photo: IdentityPhoto): void {
    const title = this.labels[photo.kind];
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.api.get(this.userId()).subscribe({
      next: (view) => {
        const fresh = view.photos.find((p) => p.id === photo.id);
        this.viewer.set({
          title,
          url: fresh?.url ?? null,
          loading: false,
          error: fresh?.url ? null : 'La persona ya reemplazó esta foto: recarga la ficha.',
        });
      },
      error: (err: HttpErrorResponse) =>
        this.viewer.set({ title, url: null, loading: false, error: this.message(err) }),
    });
  }

  private apply(view: IdentityView): void {
    this.view.set(view);
    this.loading.set(false);
    this.busyPhotoId.set(null);
    this.loaded.emit(view);
  }

  private failAction(err: HttpErrorResponse): void {
    this.busyPhotoId.set(null);
    this.error.set(this.message(err));
    // The photo may have changed under us (retaken, reviewed by someone else).
    this.load();
  }

  private message(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
