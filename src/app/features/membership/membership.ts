import { Component, computed, inject, signal } from '@angular/core';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import type { Benefit } from '../../core/models/benefit.model';
import type { Membership } from '../../core/models/membership.model';
import { BenefitsApi } from './benefits.api';
import { BenefitsCatalog } from './benefits-catalog';

interface MembershipPayload {
  name: string;
  description: string | null;
  priceUsd: number;
  benefitIds: number[];
}

@Component({
  selector: 'app-membership',
  imports: [FormsModule, DatePipe, BenefitsCatalog, BusyDirective],
  templateUrl: './membership.html',
})
export class MembershipPage {
  private readonly http = inject(HttpClient);
  private readonly benefitsApi = inject(BenefitsApi);
  private readonly baseUrl = `${environment.apiUrl}/memberships`;

  readonly versions = signal<Membership[]>([]);
  readonly benefits = signal<Benefit[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modalOpen = signal(false);

  readonly current = computed(() => this.versions().find((v) => v.active) ?? null);
  readonly archived = computed(() => this.versions().filter((v) => !v.active));

  name = '';
  description = '';
  priceUsd = 0;
  selectedBenefits = new Set<number>();

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<Membership[]>(this.baseUrl).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.messageOf(err));
      },
    });
    this.benefitsApi.list().subscribe({
      next: (items) => this.benefits.set(items.filter((b) => b.active)),
    });
  }

  benefitName(id: number): string {
    return this.benefits().find((b) => b.id === id)?.name ?? `#${id}`;
  }

  /** The embedded catalog changed: refresh the benefits offered per version. */
  reloadBenefits(): void {
    this.benefitsApi.list().subscribe({
      next: (items) => this.benefits.set(items.filter((b) => b.active)),
    });
  }

  openModal(): void {
    const current = this.current();
    this.name = current?.name ?? '';
    this.description = current?.description ?? '';
    this.priceUsd = current ? Number(current.priceUsd) : 0;
    this.selectedBenefits = new Set(current?.benefitIds ?? []);
    this.error.set(null);
    this.modalOpen.set(true);
  }

  toggleBenefit(id: number): void {
    if (this.selectedBenefits.has(id)) {
      this.selectedBenefits.delete(id);
    } else {
      this.selectedBenefits.add(id);
    }
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

    const request = this.current()
      ? this.http.put<Membership>(`${this.baseUrl}/current`, payload)
      : this.http.post<Membership>(this.baseUrl, payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  private messageOf(err: HttpErrorResponse): string {
    return (
      (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API'
    );
  }
}
