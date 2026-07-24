import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Setting } from '../../core/models/setting.model';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/settings`;

  list(): Observable<Setting[]> {
    return this.http.get<Setting[]>(this.baseUrl);
  }

  /** Keys are born in migrations: only the value can change. */
  update(key: string, value: unknown): Observable<Setting> {
    return this.http.patch<Setting>(`${this.baseUrl}/${key}`, { value });
  }
}
