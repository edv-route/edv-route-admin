import { Component, computed, inject, signal } from '@angular/core';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import type { Benefit } from '../../core/models/benefit.model';
import type { Membership } from '../../core/models/membership.model';
import { BenefitsApi } from './benefits.api';

interface MembershipPayload {
  name: string;
  description: string | null;
  priceUsd: number;
  benefitIds: number[];
}

/**
 * Full-page membership editor (create or edit the single membership + its
 * benefits). Benefits are created and selected here — there is no separate
 * catalog. Editing a version that already has paying members creates a new
 * version; existing members keep theirs (immutability, doc v7 #22). Replaces the
 * old cramped modal.
 */
@Component({
  selector: 'app-membership-editor',
  imports: [FormsModule, RouterLink, BusyDirective],
  templateUrl: './membership-editor.html',
})
export class MembershipEditor {
  private readonly http = inject(HttpClient);
  private readonly benefitsApi = inject(BenefitsApi);
  private readonly router = inject(Router);
  private readonly baseUrl = `${environment.apiUrl}/memberships`;

  readonly current = signal<Membership | null>(null);
  readonly benefits = signal<Benefit[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly addingBenefit = signal(false);
  readonly error = signal<string | null>(null);

  readonly isEdit = computed(() => this.current() !== null);
  /** Members on the active version (non-rejected); drives the versioning warning. */
  readonly memberCount = computed(() => this.current()?.memberCount ?? 0);
  /** Saving will create a NEW version (the active one already has members). */
  readonly willVersion = computed(() => this.memberCount() > 0);

  name = '';
  description = '';
  priceUsd = 0;
  selectedBenefits = new Set<number>();
  newBenefitName = '';
  newBenefitDescription = '';

  constructor() {
    this.http.get<Membership[]>(this.baseUrl).subscribe({
      next: (versions) => {
        const current = versions.find((v) => v.active) ?? null;
        this.current.set(current);
        if (current) {
          this.name = current.name;
          this.description = current.description ?? '';
          this.priceUsd = Number(current.priceUsd);
          this.selectedBenefits = new Set(current.benefitIds);
        }
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.messageOf(err));
      },
    });
    this.reloadBenefits();
  }

  private reloadBenefits(): void {
    this.benefitsApi.list().subscribe({
      next: (items) => this.benefits.set(items.filter((b) => b.active)),
    });
  }

  toggleBenefit(id: number): void {
    if (this.selectedBenefits.has(id)) this.selectedBenefits.delete(id);
    else this.selectedBenefits.add(id);
  }

  /** Creates a benefit and includes it at once (persisted with the membership). */
  addBenefit(): void {
    const name = this.newBenefitName.trim();
    if (name === '' || this.addingBenefit()) return;
    this.addingBenefit.set(true);
    this.error.set(null);
    this.benefitsApi
      .create({
        name,
        description:
          this.newBenefitDescription.trim() === '' ? null : this.newBenefitDescription.trim(),
      })
      .subscribe({
        next: (b) => {
          this.benefits.update((list) => [...list, b]);
          this.selectedBenefits.add(b.id);
          this.newBenefitName = '';
          this.newBenefitDescription = '';
          this.addingBenefit.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.addingBenefit.set(false);
          this.error.set(this.messageOf(err));
        },
      });
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const payload: MembershipPayload = {
      name: this.name,
      description: this.description.trim() === '' ? null : this.description.trim(),
      priceUsd: this.priceUsd,
      benefitIds: [...this.selectedBenefits],
    };

    const request = this.isEdit()
      ? this.http.put<Membership>(`${this.baseUrl}/current`, payload)
      : this.http.post<Membership>(this.baseUrl, payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/membership']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  private messageOf(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
