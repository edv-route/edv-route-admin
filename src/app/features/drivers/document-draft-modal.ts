import { Component, computed, inject, input, type OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Requirement } from '../../core/models/requirement.model';
import { RequirementsApi } from '../requirements/requirements.api';
import { Select, type SelectOption } from '../../shared/components/select';
import { validateFile } from '../documents/documents.api';

/** A driver document queued in the wizard; the File is uploaded after the alta. */
export interface DocDraft {
  requirementId: number;
  requirementName: string;
  file: File | null;
  fileName: string | null;
}

/**
 * Add/edit-document dialog for the registration wizard, for driver OR vehicle
 * documents (`appliesTo`). Pure client-side capture: it NEVER touches the backend.
 * On confirm it emits a `DocDraft` (requirement + an optional File); the wizard
 * accumulates or replaces it and persists everything in the single
 * `POST /drivers/register` transaction. Only requirements of the given `appliesTo`
 * are offered, minus those already queued (`takenIds`); in edit mode the current
 * requirement stays selectable.
 */
@Component({
  selector: 'app-document-draft-modal',
  imports: [FormsModule, Select],
  templateUrl: './document-draft-modal.html',
})
export class DocumentDraftModal implements OnInit {
  private readonly requirementsApi = inject(RequirementsApi);

  /** Which owner's requirements to offer (drives the filter + the labels). */
  readonly appliesTo = input<'driver' | 'vehicle'>('driver');
  /** Requirement ids already used by other queued documents (excluded here). */
  readonly takenIds = input<number[]>([]);
  /** When set, the dialog opens in "edit" mode seeded with this draft. */
  readonly initial = input<DocDraft | null>(null);
  readonly saved = output<DocDraft>();
  readonly cancel = output<void>();

  readonly requirements = signal<Requirement[]>([]);
  readonly error = signal<string | null>(null);

  requirementId: number | null = null;
  file: File | null = null;
  fileName: string | null = null;

  /** "del chofer" / "del vehículo" for the labels. */
  readonly ownerLabel = computed(() => (this.appliesTo() === 'vehicle' ? 'del vehículo' : 'del chofer'));

  /** Requirements of this owner still selectable (active, not already queued). */
  readonly reqOptions = computed<SelectOption[]>(() => {
    const taken = new Set(this.takenIds());
    const owner = this.appliesTo();
    return this.requirements()
      .filter((r) => r.active && r.appliesTo === owner && !taken.has(r.id))
      .map((r) => ({ value: r.id, label: r.isRequired ? `${r.name} *` : r.name }));
  });

  constructor() {
    this.requirementsApi.list().subscribe({ next: (r) => this.requirements.set(r), error: () => {} });
  }

  ngOnInit(): void {
    const draft = this.initial();
    if (!draft) return;
    this.requirementId = draft.requirementId;
    this.file = draft.file;
    this.fileName = draft.fileName;
  }

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
    this.file = file;
    this.fileName = file?.name ?? null;
  }

  clearFile(): void {
    this.file = null;
    this.fileName = null;
  }

  confirm(): void {
    const req = this.requirements().find((r) => r.id === this.requirementId);
    if (!req) {
      this.error.set('Elige un requerimiento.');
      return;
    }
    this.saved.emit({ requirementId: req.id, requirementName: req.name, file: this.file, fileName: this.fileName });
  }
}
