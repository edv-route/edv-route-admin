import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Benefit } from '../../core/models/benefit.model';

export interface BenefitInput {
  name?: string;
  description?: string | null;
  active?: boolean;
}

/**
 * Benefits are the membership's catalog: a benefit only exists to be granted
 * by a membership version. Its API lives with the membership feature.
 */
@Injectable({ providedIn: 'root' })
export class BenefitsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/benefits`;

  list(): Observable<Benefit[]> {
    return this.http.get<Benefit[]>(this.baseUrl);
  }

  create(data: BenefitInput): Observable<Benefit> {
    return this.http.post<Benefit>(this.baseUrl, data);
  }

  update(id: number, data: BenefitInput): Observable<Benefit> {
    return this.http.patch<Benefit>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
