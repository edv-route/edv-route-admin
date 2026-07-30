import { Component, computed, inject, input, output, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, type Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';
import { Select, type SelectOption } from '../../shared/components/select';
import { DriversApi } from './drivers.api';

const MAX_PHOTOS = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png'];

interface PhotoDraft {
  file: File;
  /** Object URL for the local preview (revoked on remove / cancel). */
  url: string;
}

/**
 * Add-vehicle dialog (profile): vehicle data + up to 3 photos in a SINGLE
 * full-width column — same shape as the wizard's `vehicle-draft-modal`. It
 * creates the vehicle and uploads its photos against the new id. The vehicle's
 * documents are managed from its detail screen, not here.
 */
@Component({
  selector: 'app-vehicle-form',
  imports: [FormsModule, Select],
  templateUrl: './vehicle-form.html',
})
export class VehicleForm {
  private readonly api = inject(DriversApi);

  readonly driverId = input.required<string>();
  readonly saved = output<void>();
  readonly cancel = output<void>();

  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  vehicleForm = { vehicleTypeId: null as number | null, brand: '', model: '', year: null as number | null, color: '', plate: '' };

  readonly photos = signal<PhotoDraft[]>([]);
  readonly maxPhotos = MAX_PHOTOS;

  readonly vehicleTypeOptions = computed<SelectOption[]>(() =>
    this.vehicleTypes().map((t) => ({ value: t.id, label: this.titleCase(t.name) })),
  );

  constructor(vehicleTypesApi: VehicleTypesApi) {
    vehicleTypesApi.list().subscribe({
      next: (t) => this.vehicleTypes.set(t.filter((v) => v.active)),
      error: () => {},
    });
  }

  /** A vehicle needs at least a type, a brand or a plate to be worth creating. */
  canConfirm(): boolean {
    const v = this.vehicleForm;
    return v.vehicleTypeId !== null || !!v.brand.trim() || !!v.plate.trim();
  }

  // --- Photos ---

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
      const invalid = this.validateImage(file);
      if (invalid) {
        this.error.set(invalid);
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

  private validateImage(file: File): string | null {
    if (!IMAGE_TYPES.includes(file.type)) return 'Las fotos deben ser JPG o PNG.';
    if (file.size > MAX_FILE_BYTES) return 'La imagen supera el máximo de 10 MB.';
    return null;
  }

  // --- Submit / cancel ---

  submit(): void {
    if (this.saving() || !this.canConfirm()) return;
    this.saving.set(true);
    this.error.set(null);
    const driverId = this.driverId();
    this.api
      .addVehicle(driverId, {
        vehicleTypeId: this.vehicleForm.vehicleTypeId,
        brand: this.titleCase(this.vehicleForm.brand) || null,
        model: this.titleCase(this.vehicleForm.model) || null,
        year: this.vehicleForm.year,
        color: this.titleCase(this.vehicleForm.color) || null,
        plate: this.vehicleForm.plate.trim().toUpperCase() || null,
      })
      .pipe(
        switchMap(({ id }) => {
          const ops: Observable<unknown>[] = [];
          for (const photo of this.photos()) {
            ops.push(this.api.vehicleImageUpload(driverId, id, photo.file).pipe(catchError(() => of(null))));
          }
          return ops.length ? forkJoin(ops).pipe(map(() => null)) : of(null);
        }),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(
            (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
          );
        },
      });
  }

  /** Cancels; revokes the previews it created to avoid leaks. */
  close(): void {
    for (const photo of this.photos()) URL.revokeObjectURL(photo.url);
    this.cancel.emit();
  }

  /**
   * Upper-cases the first letter of each word (Spanish-aware) without touching
   * the rest, so acronyms like "BMW" survive — same as the wizard modal.
   */
  private titleCase(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .map((word) => (word ? word.charAt(0).toLocaleUpperCase('es') + word.slice(1) : word))
      .join(' ');
  }
}
