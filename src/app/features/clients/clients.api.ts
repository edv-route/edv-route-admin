import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ClientList } from '../../core/models/client.model';

@Injectable({ providedIn: 'root' })
export class ClientsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/clients`;

  list(opts: {
    status?: string;
    search?: string;
    page: number;
    limit: number;
  }): Observable<ClientList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.search) params = params.set('search', opts.search);
    return this.http.get<ClientList>(this.baseUrl, { params });
  }
}
