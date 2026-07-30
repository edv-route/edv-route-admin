import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DriverDetail, DriverList } from '../../core/models/driver.model';

export interface CreateDriverInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  secondLastName?: string | null;
  birthDate?: string | null;
  address?: string | null;
  email?: string | null;
  /** Canonical E.164 (+58...), composed from the locked country selector. */
  phone?: string | null;
  /** Canonical "V-12345678", composed from type + number. */
  nationalId?: string | null;
  /** App login password (username = national id). Omit to keep unchanged. */
  password?: string | null;
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

/** Payment details captured at cobro time (v8, Pieza 2); stamped on the invoice. */
export interface PaymentMeta {
  paymentMethodId?: number | null;
  reference?: string | null;
  payerBank?: string | null;
}

/** Response of the transactional registration. */
export type RegisterResult = DriverDetail & {
  invoiceNumbers: string[];
  createdDocumentIds: string[];
  createdVehicles: { id: string; documentIds: string[] }[];
  primaryInvoiceId: string | null;
};

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

  /**
   * Transactional registration: personal data + optional vehicles, document
   * metadata and payment in a single request. Everything persists in one
   * transaction; document FILES are uploaded afterwards against the returned
   * `createdDocumentIds` (same order as the sent `documents`). `payment` null
   * leaves the driver pending.
   */
  register(
    data: CreateDriverInput,
    extras: {
      payment: ({ planId: number; periods: number } & PaymentMeta) | null;
      vehicles: (VehicleInput & { documents?: { requirementId: number }[] })[];
      documents: { requirementId: number; expiresAt: string | null }[];
    },
  ): Observable<RegisterResult> {
    return this.http.post<RegisterResult>(`${this.baseUrl}/register`, { ...data, ...extras });
  }

  update(id: string, data: Partial<CreateDriverInput> & { status?: string }): Observable<DriverDetail> {
    return this.http.patch<DriverDetail>(`${this.baseUrl}/${id}`, data);
  }

  /** Returns the created vehicle id (used to attach its documents afterwards). */
  addVehicle(id: string, data: VehicleInput): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.baseUrl}/${id}/vehicles`, data);
  }

  /** Edits a vehicle's data. */
  updateVehicle(driverId: string, vehicleId: string, data: VehicleInput): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/${driverId}/vehicles/${vehicleId}`, data);
  }

  /** Uploads a vehicle photo (multipart). Returns its id + slot (1-3). */
  vehicleImageUpload(
    driverId: string,
    vehicleId: string,
    file: File,
  ): Observable<{ id: string; position: number }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ id: string; position: number }>(
      `${this.baseUrl}/${driverId}/vehicles/${vehicleId}/images`,
      form,
    );
  }

  /** Signed URL to view a vehicle photo. */
  vehicleImageUrl(
    driverId: string,
    vehicleId: string,
    imageId: string,
  ): Observable<{ url: string; expiresIn: number }> {
    return this.http.get<{ url: string; expiresIn: number }>(
      `${this.baseUrl}/${driverId}/vehicles/${vehicleId}/images/${imageId}/file`,
    );
  }

  vehicleImageDelete(driverId: string, vehicleId: string, imageId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/${driverId}/vehicles/${vehicleId}/images/${imageId}`,
    );
  }

  /** Returns the created record id: the file is attached to it afterwards. */
  addDocument(id: string, data: DocumentInput): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.baseUrl}/${id}/documents`, data);
  }

  enroll(
    id: string,
    planId: number,
    periods: number,
    meta: PaymentMeta = {},
  ): Observable<{ invoiceNumbers: string[]; primaryInvoiceId: string | null }> {
    return this.http.post<{ invoiceNumbers: string[]; primaryInvoiceId: string | null }>(
      `${this.baseUrl}/${id}/enroll`,
      { planId, periods, ...meta },
    );
  }

  /** Uploads the payment receipt (comprobante) to an invoice. */
  uploadInvoiceProof(invoiceId: string, file: File): Observable<{ path: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ path: string }>(
      `${environment.apiUrl}/invoices/${invoiceId}/proof`,
      form,
    );
  }

  /** Signed URL to view an invoice's receipt. */
  invoiceProofUrl(invoiceId: string): Observable<{ url: string; expiresIn: number }> {
    return this.http.get<{ url: string; expiresIn: number }>(
      `${environment.apiUrl}/invoices/${invoiceId}/proof`,
    );
  }

  approve(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/approve`, {});
  }

  /** A different planId turns the renewal into a plan change. */
  renewSubscription(
    id: string,
    periods: number,
    planId?: number,
    meta: PaymentMeta = {},
    note?: string | null,
  ): Observable<{
    invoiceNumbers: string[];
    reactivated: boolean;
    planChanged: boolean;
    startsAt?: string;
    primaryInvoiceId: string | null;
  }> {
    return this.http.post<{
      invoiceNumbers: string[];
      reactivated: boolean;
      planChanged: boolean;
      startsAt?: string;
      primaryInvoiceId: string | null;
    }>(`${this.baseUrl}/${id}/subscription/renew`, {
      periods,
      ...(planId !== undefined ? { planId } : {}),
      ...(note ? { note } : {}),
      ...meta,
    });
  }

  cancelScheduledChange(
    id: string,
  ): Observable<{ refundedPayments: number; voidedInvoices: number }> {
    return this.http.post<{ refundedPayments: number; voidedInvoices: number }>(
      `${this.baseUrl}/${id}/subscription/cancel-change`,
      {},
    );
  }

  reject(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/reject`, {});
  }

  /** Administrative pause (licencia): approved + tariff up to date -> paused. */
  pause(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/pause`, {});
  }

  /** Lifts the pause: paused -> approved + available, tariff resumes running. */
  resume(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/resume`, {});
  }

  /**
   * External payment (v8): money handed to the admin outside the system.
   * Settles the outstanding charges (arrears + penalty) and issues their
   * invoice; the debt engine then derives the driver out of overdue/penalized.
   */
  registerExternalPayment(
    id: string,
    note: string | null,
    meta: PaymentMeta = {},
  ): Observable<{
    invoiceNumber: string;
    primaryInvoiceId: string | null;
    settledCharges: number;
    totalUsd: string;
  }> {
    return this.http.post<{
      invoiceNumber: string;
      primaryInvoiceId: string | null;
      settledCharges: number;
      totalUsd: string;
    }>(`${this.baseUrl}/${id}/external-payment`, { note, ...meta });
  }

  /** Manual reactivation (v8): back on the road now (requires debt settled). */
  reactivate(id: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/reactivate`, {});
  }
}
