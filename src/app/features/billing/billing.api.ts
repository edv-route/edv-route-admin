import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { InvoiceDetail, InvoiceList, PaymentList } from '../../core/models/billing.model';

export interface InvoiceListOptions {
  status?: string;
  driverId?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface PaymentListOptions {
  kind?: string;
  status?: string;
  driverId?: string;
  search?: string;
  page: number;
  limit: number;
}

/** One month of invoicing (business-timezone month, voided excluded). */
export interface MonthlyInvoicingPoint {
  month: string;
  totalUsd: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  invoices(opts: InvoiceListOptions): Observable<InvoiceList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.driverId) params = params.set('driverId', opts.driverId);
    if (opts.search) params = params.set('search', opts.search);
    return this.http.get<InvoiceList>(`${environment.apiUrl}/invoices`, { params });
  }

  payments(opts: PaymentListOptions): Observable<PaymentList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.kind) params = params.set('kind', opts.kind);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.driverId) params = params.set('driverId', opts.driverId);
    if (opts.search) params = params.set('search', opts.search);
    return this.http.get<PaymentList>(`${environment.apiUrl}/payments`, { params });
  }

  invoiceDetail(id: string): Observable<InvoiceDetail> {
    return this.http.get<InvoiceDetail>(`${environment.apiUrl}/invoices/${id}`);
  }

  monthlySeries(months: number): Observable<MonthlyInvoicingPoint[]> {
    const params = new HttpParams().set('months', months);
    return this.http.get<MonthlyInvoicingPoint[]>(
      `${environment.apiUrl}/invoices/monthly-series`,
      { params },
    );
  }

  /** Short-lived signed URL to view an invoice's receipt (comprobante). */
  invoiceProofUrl(id: string): Observable<{ url: string; expiresIn: number }> {
    return this.http.get<{ url: string; expiresIn: number }>(
      `${environment.apiUrl}/invoices/${id}/proof`,
    );
  }
}
