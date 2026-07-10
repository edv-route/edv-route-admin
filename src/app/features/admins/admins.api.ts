import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Admin } from '../../core/models/admin.model';

export interface CreateAdminInput {
  username: string;
  fullName: string;
  email?: string | null;
  password: string;
}

export interface UpdateAdminInput {
  fullName?: string;
  email?: string | null;
  status?: 'active' | 'suspended';
}

@Injectable({ providedIn: 'root' })
export class AdminsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admins`;

  list(): Observable<Admin[]> {
    return this.http.get<Admin[]>(this.baseUrl);
  }

  create(data: CreateAdminInput): Observable<Admin> {
    return this.http.post<Admin>(this.baseUrl, data);
  }

  update(id: string, data: UpdateAdminInput): Observable<Admin> {
    return this.http.patch<Admin>(`${this.baseUrl}/${id}`, data);
  }

  updatePassword(id: string, password: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}/password`, { password });
  }
}
