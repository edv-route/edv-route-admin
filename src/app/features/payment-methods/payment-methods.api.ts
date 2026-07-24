import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PaymentMethod, PaymentMethodType } from '../../core/models/payment-method.model';

export interface PaymentMethodInput {
  name: string;
  type: PaymentMethodType;
  details: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/payment-methods`;

  list(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(this.baseUrl);
  }

  create(data: PaymentMethodInput): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(this.baseUrl, data);
  }

  update(
    id: number,
    data: Partial<PaymentMethodInput> & { isActive?: boolean },
  ): Observable<PaymentMethod> {
    return this.http.patch<PaymentMethod>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
