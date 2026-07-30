import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DocumentList } from '../../core/models/document.model';

/** Mirrors the server-side contract (bucket + backend both enforce it). */
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface DocumentListOptions {
  status?: string;
  requirementId?: number;
  search?: string;
  expiringDays?: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/documents`;

  list(opts: DocumentListOptions): Observable<DocumentList> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.requirementId) params = params.set('requirementId', opts.requirementId);
    if (opts.search) params = params.set('search', opts.search);
    if (opts.expiringDays) params = params.set('expiringDays', opts.expiringDays);
    return this.http.get<DocumentList>(this.baseUrl, { params });
  }

  /** The file travels to our backend, never straight to the storage vendor. */
  uploadFile(documentId: string, file: File): Observable<{ path: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ path: string }>(`${this.baseUrl}/${documentId}/file`, form);
  }

  /** Short-lived link for a private file. */
  fileUrl(documentId: string): Observable<{ url: string; expiresIn: number }> {
    return this.http.get<{ url: string; expiresIn: number }>(`${this.baseUrl}/${documentId}/file`);
  }

  /** Removes a document and its stored file. */
  delete(documentId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${documentId}`);
  }
}

/** Client-side pre-check; the backend re-validates by content, not by name. */
export function validateFile(file: File): string | null {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) return 'Formato no admitido: solo PDF, JPG o PNG.';
  if (file.size > MAX_FILE_BYTES) return 'El archivo supera el máximo de 10 MB.';
  return null;
}
