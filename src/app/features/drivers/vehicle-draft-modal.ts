import { Component, computed, inject, input, type OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';
import { Select, type SelectOption } from '../../shared/components/select';
import type { DocDraft } from './document-draft-modal';

const MAX_PHOTOS = 3;
const IMAGE_TYPES = ['image/jpeg', 'image/png'];

/** A vehicle photo queued in the wizard; the File is uploaded after the alta. */
export interface VehiclePhotoDraft {
  file: File;
  /** Object URL for the local preview (revoked on remove / cancel). */
  url: string;
}

/** A vehicle accumulated client-side; persisted with the register transaction.
 *  Its documents are managed from the wizard card (app-document-draft-modal with
 *  appliesTo="vehicle"), not here — this dialog only captures data + photos. */
export interface VehicleDraft {
  vehicleTypeId: number | null;
  brand: string;
  model: string;
  year: number | null;
  color: string;
  plate: string;
  photos: VehiclePhotoDraft[];
  documents: DocDraft[];
}

/**
 * Add/edit-vehicle dialog for the registration wizard — DATA + PHOTOS only, in a
 * single full-width column. The vehicle's documents live on the wizard card (a
 * separate document dialog), so this one just preserves them across an edit. Pure
 * client-side capture: it NEVER touches the backend; on confirm it emits a
 * `VehicleDraft` that the wizard accumulates or replaces and persists in the
 * single `POST /drivers/register` transaction.
 *
 * Object URL lifecycle: the dialog always owns FRESH preview URLs (even when
 * editing it re-creates them from the persisted File objects), so removing a photo
 * or cancelling never breaks the card already shown in the list. On cancel it
 * revokes its own URLs; on confirm their ownership passes to the wizard.
 */
@Component({
  selector: 'app-vehicle-draft-modal',
  imports: [FormsModule, Select],
  templateUrl: './vehicle-draft-modal.html',
})
export class VehicleDraftModal implements OnInit {
  private readonly vehicleTypesApi = inject(VehicleTypesApi);

  /** When set, the dialog opens in "edit" mode seeded with this draft. */
  readonly initial = input<VehicleDraft | null>(null);
  readonly saved = output<VehicleDraft>();
  readonly cancel = output<void>();

  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly error = signal<string | null>(null);

  vehicleForm = { vehicleTypeId: null as number | null, brand: '', model: '', year: null as number | null, color: '', plate: '' };

  readonly photos = signal<VehiclePhotoDraft[]>([]);
  /** The vehicle's documents are edited elsewhere; kept here to preserve on save. */
  private documents: DocDraft[] = [];

  readonly maxPhotos = MAX_PHOTOS;

  readonly vehicleTypeOptions = computed<SelectOption[]>(() =>
    this.vehicleTypes().map((t) => ({ value: t.id, label: this.titleCase(t.name) })),
  );

  /**
   * A vehicle needs at least a type, a brand or a plate to be worth queuing.
   * Plain method, NOT a computed: `vehicleForm` is a POJO bound with ngModel, so
   * there is no signal to invalidate a computed — it would cache the empty-form
   * `false` forever. As a method it re-evaluates on each change detection.
   */
  canConfirm(): boolean {
    const v = this.vehicleForm;
    return v.vehicleTypeId !== null || !!v.brand.trim() || !!v.plate.trim();
  }

  constructor() {
    this.vehicleTypesApi.list().subscribe({
      next: (t) => this.vehicleTypes.set(t.filter((v) => v.active)),
      error: () => {},
    });
  }

  ngOnInit(): void {
    const draft = this.initial();
    if (!draft) return;
    this.vehicleForm = {
      vehicleTypeId: draft.vehicleTypeId,
      brand: draft.brand,
      model: draft.model,
      year: draft.year,
      color: draft.color,
      plate: draft.plate,
    };
    // Fresh preview URLs so this dialog fully owns them; the original draft keeps
    // its own URLs until the wizard replaces it on save (or restores on cancel).
    this.photos.set(draft.photos.map((p) => ({ file: p.file, url: URL.createObjectURL(p.file) })));
    this.documents = draft.documents; // preserved, not editable here
  }

  onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.error.set(null);
    for (const file of files) {
      if (this.photos().length >= MAX_PHOTOS) {
        this.error.set(`Máximo ${MAX_PHOTOS} fotos por vehículo`);
        break;
      }
      if (!IMAGE_TYPES.includes(file.type)) {
        this.error.set('Las fotos deben ser JPG o PNG.');
        continue;
      }
      this.photos.update((list) => [...list, { file, url: URL.createObjectURL(file) }]);
    }
  }

  removePhoto(index: number): void {
    const photo = this.photos()[index];
    if (photo) URL.revokeObjectURL(photo.url);
    this.photos.update((list) => list.filter((_, i) => i !== index));
  }

  /** Hands the draft off to the wizard; photo URLs stay valid for the list. */
  confirm(): void {
    if (!this.canConfirm()) {
      this.error.set('Indica al menos el tipo, la marca o la placa del vehículo.');
      return;
    }
    this.saved.emit({
      vehicleTypeId: this.vehicleForm.vehicleTypeId,
      brand: this.titleCase(this.vehicleForm.brand),
      model: this.titleCase(this.vehicleForm.model),
      year: this.vehicleForm.year,
      color: this.titleCase(this.vehicleForm.color),
      plate: this.vehicleForm.plate.trim().toUpperCase(),
      photos: this.photos(),
      documents: this.documents,
    });
  }

  /** Discards the draft; revokes the previews it created to avoid leaks. */
  close(): void {
    for (const photo of this.photos()) URL.revokeObjectURL(photo.url);
    this.cancel.emit();
  }

  /**
   * Upper-cases the first letter of each word (Spanish-aware) without touching
   * the rest, so acronyms like "BMW" survive. Matches the CSS `capitalize` the
   * inputs and cards use, keeping the queued value and its display in sync.
   */
  private titleCase(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .map((word) => (word ? word.charAt(0).toLocaleUpperCase('es') + word.slice(1) : word))
      .join(' ');
  }
}
