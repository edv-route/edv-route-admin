import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AuditLogFacets, AuditLogList } from '../../core/models/audit-log.model';

export interface AuditLogListOptions {
  eventType?: string;
  source?: 'admin' | 'system';
  adminId?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/audit-logs`;

  list(opts: AuditLogListOptions): Observable<AuditLogList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.eventType) params = params.set('eventType', opts.eventType);
    if (opts.source) params = params.set('source', opts.source);
    if (opts.adminId) params = params.set('adminId', opts.adminId);
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    return this.http.get<AuditLogList>(this.baseUrl, { params });
  }

  facets(): Observable<AuditLogFacets> {
    return this.http.get<AuditLogFacets>(`${this.baseUrl}/facets`);
  }
}
