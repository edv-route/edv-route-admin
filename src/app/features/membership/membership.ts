import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import type { Benefit } from '../../core/models/benefit.model';
import type { Membership } from '../../core/models/membership.model';
import { BenefitsApi } from './benefits.api';

/**
 * Membership overview: the active version, its benefits and the version history.
 * Creating/editing (and managing benefits) happens on the full-page editor at
 * `/membership/edit` — there is no separate benefits catalog.
 */
@Component({
  selector: 'app-membership',
  imports: [DatePipe, RouterLink],
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

  readonly current = computed(() => this.versions().find((v) => v.active) ?? null);
  readonly archived = computed(() => this.versions().filter((v) => !v.active));

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
        this.error.set(
          (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        );
      },
    });
    this.benefitsApi.list().subscribe({
      next: (items) => this.benefits.set(items.filter((b) => b.active)),
    });
  }

  benefitName(id: number): string {
    return this.benefits().find((b) => b.id === id)?.name ?? `#${id}`;
  }
}
