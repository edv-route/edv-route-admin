import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  TrainingDetail,
  TrainingInput,
  TrainingList,
} from '../../core/models/training.model';

@Injectable({ providedIn: 'root' })
export class TrainingsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/trainings`;

  list(opts: { status?: string; page: number; limit: number }): Observable<TrainingList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.status) params = params.set('status', opts.status);
    return this.http.get<TrainingList>(this.baseUrl, { params });
  }

  detail(id: number): Observable<TrainingDetail> {
    return this.http.get<TrainingDetail>(`${this.baseUrl}/${id}`);
  }

  create(data: TrainingInput): Observable<TrainingDetail> {
    return this.http.post<TrainingDetail>(this.baseUrl, data);
  }

  update(id: number, data: TrainingInput): Observable<TrainingDetail> {
    return this.http.put<TrainingDetail>(`${this.baseUrl}/${id}`, data);
  }

  setStatus(id: number, status: 'cancelled' | 'completed'): Observable<TrainingDetail> {
    return this.http.patch<TrainingDetail>(`${this.baseUrl}/${id}/status`, { status });
  }

  enroll(id: number, driverId: string): Observable<TrainingDetail> {
    return this.http.post<TrainingDetail>(`${this.baseUrl}/${id}/attendees`, { driverId });
  }

  setAttendeeStatus(
    id: number,
    attendeeId: string,
    status: 'attended' | 'absent' | 'cancelled',
  ): Observable<TrainingDetail> {
    return this.http.patch<TrainingDetail>(`${this.baseUrl}/${id}/attendees/${attendeeId}`, {
      status,
    });
  }
}
