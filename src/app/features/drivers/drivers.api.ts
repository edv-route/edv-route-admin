import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DriverDetail, DriverList } from '../../core/models/driver.model';

export interface CreateDriverInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  nationalId?: string | null;
}

export interface VehicleInput {
  vehicleTypeId?: number | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  plate?: string | null;
}

export interface DocumentInput {
  requirementId: number;
  vehicleId?: string | null;
  fileUrl?: string | null;
  expiresAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DriversApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/drivers`;

  list(opts: { status?: string; search?: string; page: number; limit: number }): Observable<DriverList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.search) params = params.set('search', opts.search);
    return this.http.get<DriverList>(this.baseUrl, { params });
  }

  detail(id: string): Observable<DriverDetail> {
    return this.http.get<DriverDetail>(`${this.baseUrl}/${id}`);
  }

  create(data: CreateDriverInput): Observable<DriverDetail> {
    return this.http.post<DriverDetail>(this.baseUrl, data);
  }

  update(id: string, data: Partial<CreateDriverInput> & { status?: string }): Observable<DriverDetail> {
    return this.http.patch<DriverDetail>(`${this.baseUrl}/${id}`, data);
  }

  addVehicle(id: string, data: VehicleInput): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/vehicles`, data);
  }

  addDocument(id: string, data: DocumentInput): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/documents`, data);
  }

  enroll(id: string, planId: number, periods: number): Observable<{ invoiceNumbers: string[] }> {
    return this.http.post<{ invoiceNumbers: string[] }>(`${this.baseUrl}/${id}/enroll`, {
      planId,
      periods,
    });
  }

  approve(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/approve`, {});
  }

  reject(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/reject`, {});
  }
}
