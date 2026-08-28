import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { LiveLocationResult, TrailResult } from '../../core/models/location.model';

@Injectable({ providedIn: 'root' })
export class LocationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/locations`;

  /** Everyone working right now, with their last known position. */
  live(opts: { maxAccuracyM?: number; since?: string } = {}): Observable<LiveLocationResult> {
    let params = new HttpParams();
    if (opts.maxAccuracyM !== undefined) params = params.set('maxAccuracyM', opts.maxAccuracyM);
    if (opts.since !== undefined) params = params.set('since', opts.since);
    return this.http.get<LiveLocationResult>(`${this.baseUrl}/live`, { params });
  }

  /**
   * One affiliate's trail between two instants.
   *
   * `from` and `to` are full ISO instants WITH offset, built from the browser's
   * own clock: whether a day starts in Caracas or in UTC is a question about the
   * user, and the server deliberately refuses to guess it.
   */
  trail(driverId: string, from: Date, to: Date): Observable<TrailResult> {
    const params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    return this.http.get<TrailResult>(`${this.baseUrl}/drivers/${driverId}/history`, { params });
  }
}
