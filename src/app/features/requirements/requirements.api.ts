import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Requirement, RequirementAppliesTo } from '../../core/models/requirement.model';

export interface RequirementInput {
  name?: string;
  description?: string | null;
  appliesTo?: RequirementAppliesTo;
  isRequired?: boolean;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class RequirementsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/requirements`;

  list(): Observable<Requirement[]> {
    return this.http.get<Requirement[]>(this.baseUrl);
  }

  create(data: RequirementInput): Observable<Requirement> {
    return this.http.post<Requirement>(this.baseUrl, data);
  }

  update(id: number, data: RequirementInput): Observable<Requirement> {
    return this.http.patch<Requirement>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
