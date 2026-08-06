import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  SubmissionDetail,
  SubmissionList,
  SubmissionStatus,
} from '../../core/models/payment-submission.model';

export interface SubmissionListOptions {
  status?: SubmissionStatus;
  driverId?: string;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class PaymentSubmissionsApi {
  private readonly http = inject(HttpClient);

  list(opts: SubmissionListOptions): Observable<SubmissionList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.driverId) params = params.set('driverId', opts.driverId);
    return this.http.get<SubmissionList>(`${environment.apiUrl}/payment-submissions`, { params });
  }

  detail(id: string): Observable<SubmissionDetail> {
    return this.http.get<SubmissionDetail>(`${environment.apiUrl}/payment-submissions/${id}`);
  }

  approve(id: string): Observable<{ invoiceNumber: string; settledCharges: number }> {
    return this.http.post<{ invoiceNumber: string; settledCharges: number }>(
      `${environment.apiUrl}/payment-submissions/${id}/approve`,
      {},
    );
  }

  reject(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/payment-submissions/${id}/reject`, { reason });
  }

  /** Reverses an approved receipt (single action): voids the invoices it generated
   *  and sends any debt it settled back to owed. Keeps the trace. */
  reverse(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/payment-submissions/${id}/reverse`, { reason });
  }

  /** Creates a submission (multipart: payment meta + 0..5 receipt/bill images).
   *  `approved` is true when the admin used the "approve immediately" toggle. */
  create(driverId: string, form: FormData): Observable<{ id: string; approved: boolean }> {
    return this.http.post<{ id: string; approved: boolean }>(
      `${environment.apiUrl}/drivers/${driverId}/payment-submissions`,
      form,
    );
  }
}
