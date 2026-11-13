import { Component, computed, inject, input, output, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type { Requirement } from '../../core/models/requirement.model';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { Select, type SelectOption } from '../../shared/components/select';
import { DocumentsApi, validateFile } from '../documents/documents.api';
import { DriversApi } from './drivers.api';

/**
 * "Agregar documento" of an affiliate: registers a document against one of the
 * requirements he still lacks, with an optional file. Extracted from the
 * affiliate profile (2026-11-13) — the profile had passed the 1000-line cap.
 */
@Component({
  selector: 'app-driver-add-document-modal',
  imports: [FormsModule, Select, BusyDirective],
  templateUrl: './driver-add-document-modal.html',
})
export class DriverAddDocumentModal {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);

  readonly driverId = input.required<string>();
  /** The driver requirements with no document yet. */
  readonly requirements = input.required<Requirement[]>();
  readonly saved = output<void>();
  readonly cancel = output<void>();

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  docRequirementId: number | null = null;
  docFile: File | null = null;
  docFileName: string | null = null;

  /** app-select options (branded dropdown; native <select> is not used). */
  readonly options = computed<SelectOption[]>(() =>
    this.requirements().map((r) => ({ value: r.id, label: r.isRequired ? `${r.name} *` : r.name })),
  );

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) {
      const problem = validateFile(file);
      if (problem) {
        this.error.set(problem);
        return;
      }
    }
    this.error.set(null);
    this.docFile = file;
    this.docFileName = file?.name ?? null;
  }

  clearFile(): void {
    this.docFile = null;
    this.docFileName = null;
  }

  /** Registers the document metadata, then attaches its file (optional). */
  save(): void {
    if (!this.docRequirementId || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const file = this.docFile;
    this.api
      .addDocument(this.driverId(), { requirementId: this.docRequirementId, expiresAt: null })
      .pipe(
        switchMap((doc) =>
          file ? this.documentsApi.uploadFile(doc.id, file).pipe(map(() => doc)) : of(doc),
        ),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set((err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API');
        },
      });
  }
}
