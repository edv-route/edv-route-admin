import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { VehicleType } from '../../core/models/vehicle-type.model';

@Injectable({ providedIn: 'root' })
export class VehicleTypesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/vehicle-types`;

  list(): Observable<VehicleType[]> {
    return this.http.get<VehicleType[]>(this.baseUrl);
  }

  create(name: string): Observable<VehicleType> {
    return this.http.post<VehicleType>(this.baseUrl, { name });
  }

  update(id: number, data: { name?: string; active?: boolean }): Observable<VehicleType> {
    return this.http.patch<VehicleType>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
