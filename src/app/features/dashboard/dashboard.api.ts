import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DashboardSummary } from '../../core/models/dashboard.model';

/** One day of invoicing (business-timezone calendar day, voided excluded). */
export interface RevenueSeriesPoint {
  date: string;
  totalUsd: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${environment.apiUrl}/dashboard/summary`);
  }

  revenueSeries(days: number): Observable<RevenueSeriesPoint[]> {
    const params = new HttpParams().set('days', days);
    return this.http.get<RevenueSeriesPoint[]>(`${environment.apiUrl}/dashboard/revenue-series`, {
      params,
    });
  }
}
