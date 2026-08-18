import { Injectable, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DocumentsApi } from './documents.api';
import type { FileViewerState } from '../../shared/components/file-viewer';

/** The minimum a document needs for these operations. */
export interface ViewableDocument {
  id: string;
  requirementName: string;
  fileUrl: string | null;
}

/**
 * Viewing and downloading a private document file. The bucket is private, so
 * both go through a short-lived signed URL asked for on demand — never a stored
 * link. Lives in a service because the affiliate detail and the solicitud detail
 * both do exactly this, and it is what pushed the affiliate detail over the
 * 1000-line limit.
 */
@Injectable({ providedIn: 'root' })
export class DocumentFileService {
  private readonly api = inject(DocumentsApi);

  /** File shown in the modal viewer (null = closed). */
  readonly viewer = signal<FileViewerState | null>(null);

  /** Id of the document being downloaded, to disable its button. */
  readonly downloadingId = signal<string | null>(null);

  closeViewer(): void {
    this.viewer.set(null);
  }

  /** Opens the file in the modal viewer through a signed URL. */
  open(doc: ViewableDocument): void {
    const title = doc.requirementName;
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.api.fileUrl(doc.id).subscribe({
      next: ({ url }) => this.viewer.set({ title, url, loading: false, error: null }),
      error: (err: HttpErrorResponse) =>
        this.viewer.set({
          title,
          url: null,
          loading: false,
          error:
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        }),
    });
  }

  /**
   * Signed URL -> blob -> saved with a readable name. Reports failures through
   * [onError] so the host screen shows them where it already shows its own.
   */
  download(doc: ViewableDocument, onError: (message: string) => void): void {
    if (this.downloadingId()) return;
    this.downloadingId.set(doc.id);
    this.api.fileUrl(doc.id).subscribe({
      next: async ({ url }) => {
        try {
          const blob = await (await fetch(url)).blob();
          const ext = doc.fileUrl?.split('.').pop()?.split('?')[0] ?? 'bin';
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${doc.requirementName}.${ext}`.replace(/\s+/g, '-');
          anchor.click();
          URL.revokeObjectURL(objectUrl);
        } catch {
          onError('No se pudo descargar el archivo. Usa «Ver» y descárgalo desde ahí.');
        } finally {
          this.downloadingId.set(null);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.downloadingId.set(null);
        onError(
          (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        );
      },
    });
  }
}
