import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { IdentityView } from '../../core/models/identity.model';

/** `/identity`: a person's identity photos and the office's verdict on each. */
@Injectable({ providedIn: 'root' })
export class IdentityApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/identity`;

  get(userId: string): Observable<IdentityView> {
    return this.http.get<IdentityView>(`${this.baseUrl}/users/${userId}`);
  }

  approve(photoId: string): Observable<IdentityView> {
    return this.http.post<IdentityView>(`${this.baseUrl}/photos/${photoId}/approve`, {});
  }

  /** Also revokes an approved photo ("pedir otra foto"). */
  reject(photoId: string, reason: string): Observable<IdentityView> {
    return this.http.post<IdentityView>(`${this.baseUrl}/photos/${photoId}/reject`, { reason });
  }
}
