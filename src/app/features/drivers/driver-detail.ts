import { Component, computed, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { DriverDetail as DriverDetailModel } from '../../core/models/driver.model';
import { DRIVER_STATUS_LABELS } from '../../core/models/driver.model';
import type { Requirement } from '../../core/models/requirement.model';
import { RequirementsApi } from '../requirements/requirements.api';
import { DriversApi } from './drivers.api';

@Component({
  selector: 'app-driver-detail',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './driver-detail.html',
})
export class DriverDetail {
  private readonly api = inject(DriversApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly statusLabels = DRIVER_STATUS_LABELS;

  readonly driver = signal<DriverDetailModel | null>(null);
  readonly requirements = signal<Requirement[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly editOpen = signal(false);
  readonly confirmAction = signal<'approve' | 'reject' | null>(null);

  fullName = '';
  nationalId = '';
  email = '';
  phone = '';

  /** Active driver-requirements with no registered document = visibly incomplete. */
  readonly missingRequirements = computed(() => {
    const d = this.driver();
    if (!d) return [];
    const covered = new Set(d.documents.map((doc) => doc.requirementId));
    return this.requirements().filter(
      (r) => r.active && r.appliesTo === 'driver' && !covered.has(r.id),
    );
  });

  constructor(requirementsApi: RequirementsApi) {
    requirementsApi.list().subscribe({ next: (r) => this.requirements.set(r) });
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
    this.fullName = d.fullName;
    this.nationalId = d.nationalId ?? '';
    this.email = d.email ?? '';
    this.phone = d.phone ?? '';
    this.error.set(null);
    this.editOpen.set(true);
  }

  saveEdit(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api
      .update(this.id(), {
        fullName: this.fullName,
        nationalId: this.nationalId.trim() || null,
        email: this.email.trim() || null,
        phone: this.phone.trim() || null,
      })
      .subscribe({
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
