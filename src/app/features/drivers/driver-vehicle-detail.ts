import { Component, computed, inject, input, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type {
  DriverDetail as DriverDetailModel,
  DriverDocument,
  DriverVehicle,
} from '../../core/models/driver.model';
import type { Requirement } from '../../core/models/requirement.model';
import type { VehicleType } from '../../core/models/vehicle-type.model';
import { RequirementsApi } from '../requirements/requirements.api';
import { VehicleTypesApi } from '../vehicle-types/vehicle-types.api';
import { Select, type SelectOption } from '../../shared/components/select';
import { FileViewer, type FileViewerState } from '../../shared/components/file-viewer';
import { DocumentsApi, validateFile } from '../documents/documents.api';
import { DriversApi } from './drivers.api';

/**
 * Per-vehicle detail screen: shows one vehicle's data and its own documents
 * (requirements with applies_to='vehicle'). Reuses the existing driver
 * endpoints — GET /drivers/:id for the data and POST /drivers/:id/documents
 * with a vehicleId to attach a vehicle document. Photos come in a later phase.
 */
@Component({
  selector: 'app-driver-vehicle-detail',
  imports: [FormsModule, RouterLink, Select, FileViewer],
  templateUrl: './driver-vehicle-detail.html',
})
export class DriverVehicleDetail {
  private readonly api = inject(DriversApi);
  private readonly documentsApi = inject(DocumentsApi);

  /** Route params (withComponentInputBinding). */
  readonly id = input.required<string>(); // driverId
  readonly vehicleId = input.required<string>();

  readonly driver = signal<DriverDetailModel | null>(null);
  readonly requirements = signal<Requirement[]>([]);
  readonly vehicleTypes = signal<VehicleType[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uploadingDocId = signal<string | null>(null);
  readonly deletingDocId = signal<string | null>(null);
  readonly uploadingPhoto = signal(false);
  /** Signed URLs for the vehicle photos, keyed by image id. */
  readonly imageUrls = signal<Record<string, string>>({});
  readonly maxPhotos = 3;
  readonly viewer = signal<FileViewerState | null>(null);
  readonly addOpen = signal(false);
  docRequirementId: number | null = null;
  readonly editOpen = signal(false);
  editForm = { vehicleTypeId: null as number | null, brand: '', model: '', year: null as number | null, color: '', plate: '' };
  readonly vehicleTypeOptions = computed<SelectOption[]>(() =>
    this.vehicleTypes().map((t) => ({ value: t.id, label: t.name })),
  );

  readonly vehicle = computed<DriverVehicle | null>(
    () => this.driver()?.vehicles.find((v) => v.id === this.vehicleId()) ?? null,
  );
  /** Documents owned by THIS vehicle. */
  readonly documents = computed(() =>
    (this.driver()?.documents ?? []).filter((d) => d.vehicleId === this.vehicleId()),
  );
  /** Active vehicle requirements not yet documented for this vehicle. */
  readonly missingRequirements = computed(() => {
    const covered = new Set(this.documents().map((d) => d.requirementId));
    return this.requirements().filter(
      (r) => r.active && r.appliesTo === 'vehicle' && !covered.has(r.id),
    );
  });
  readonly docRequirementOptions = computed<SelectOption[]>(() =>
    this.missingRequirements().map((r) => ({
      value: r.id,
      label: r.isRequired ? `${r.name} *` : r.name,
    })),
  );

  constructor(requirementsApi: RequirementsApi, vehicleTypesApi: VehicleTypesApi) {
    requirementsApi.list().subscribe({ next: (r) => this.requirements.set(r), error: () => {} });
    vehicleTypesApi.list().subscribe({ next: (t) => this.vehicleTypes.set(t), error: () => {} });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.detail(this.id()).subscribe({
      next: (d) => {
        this.driver.set(d);
        this.loading.set(false);
        this.loadImages();
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.fail(err);
      },
    });
  }

  /** Fetches a short-lived signed URL for each of the vehicle's photos. */
  private loadImages(): void {
    const v = this.vehicle();
    if (!v) return;
    this.imageUrls.set({});
    for (const img of v.images) {
      this.api.vehicleImageUrl(this.id(), this.vehicleId(), img.id).subscribe({
        next: ({ url }) => this.imageUrls.update((m) => ({ ...m, [img.id]: url })),
        error: () => {},
      });
    }
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const v = this.vehicle();
    if (!v || this.uploadingPhoto()) return;
    const slots = this.maxPhotos - v.images.length;
    const toUpload = files.slice(0, slots).filter((f) => {
      if (!['image/jpeg', 'image/png'].includes(f.type)) {
        this.error.set('Las fotos deben ser JPG o PNG.');
        return false;
      }
      return true;
    });
    if (toUpload.length === 0) return;
    this.error.set(null);
    this.uploadingPhoto.set(true);
    forkJoin(
      toUpload.map((f) =>
        this.api.vehicleImageUpload(this.id(), this.vehicleId(), f).pipe(catchError(() => of(null))),
      ),
    ).subscribe(() => {
      this.uploadingPhoto.set(false);
      this.load();
    });
  }

  removePhoto(imageId: string): void {
    this.api.vehicleImageDelete(this.id(), this.vehicleId(), imageId).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  vehicleTypeName(id: number | null): string {
    return this.vehicleTypes().find((t) => t.id === id)?.name ?? 'Sin definir';
  }

  openAdd(): void {
    this.docRequirementId = null;
    this.error.set(null);
    this.addOpen.set(true);
  }

  openEdit(): void {
    const v = this.vehicle();
    if (!v) return;
    this.editForm = {
      vehicleTypeId: v.vehicleTypeId,
      brand: v.brand ?? '',
      model: v.model ?? '',
      year: v.year,
      color: v.color ?? '',
      plate: v.plate ?? '',
    };
    this.error.set(null);
    this.editOpen.set(true);
  }

  saveEdit(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .updateVehicle(this.id(), this.vehicleId(), {
        vehicleTypeId: this.editForm.vehicleTypeId,
        brand: this.editForm.brand.trim() || null,
        model: this.editForm.model.trim() || null,
        year: this.editForm.year,
        color: this.editForm.color.trim() || null,
        plate: this.editForm.plate.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editOpen.set(false);
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.fail(err);
        },
      });
  }

  /** Registers a vehicle document; the file is attached afterwards from the list. */
  addDocument(): void {
    if (!this.docRequirementId || this.saving()) return;
    this.saving.set(true);
    this.api
      .addDocument(this.id(), { requirementId: this.docRequirementId, vehicleId: this.vehicleId() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.addOpen.set(false);
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.fail(err);
        },
      });
  }

  /** Attaches (or replaces) a document's private file. */
  uploadFile(event: Event, documentId: string): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    const invalid = validateFile(file);
    if (invalid) {
      this.error.set(invalid);
      return;
    }
    this.error.set(null);
    this.uploadingDocId.set(documentId);
    this.documentsApi.uploadFile(documentId, file).subscribe({
      next: () => {
        this.uploadingDocId.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.uploadingDocId.set(null);
        this.fail(err);
      },
    });
  }

  /** Opens the private file in the shared modal viewer. */
  openFile(doc: DriverDocument): void {
    const title = doc.requirementName;
    this.viewer.set({ title, url: null, loading: true, error: null });
    this.documentsApi.fileUrl(doc.id).subscribe({
      next: ({ url }) => this.viewer.set({ title, url, loading: false, error: null }),
      error: (err: HttpErrorResponse) =>
        this.viewer.set({ title, url: null, loading: false, error: this.msg(err) }),
    });
  }

  /** Removes a vehicle document and reloads. */
  deleteDocument(doc: DriverDocument): void {
    if (this.deletingDocId()) return;
    this.error.set(null);
    this.deletingDocId.set(doc.id);
    this.documentsApi.delete(doc.id).subscribe({
      next: () => {
        this.deletingDocId.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.deletingDocId.set(null);
        this.fail(err);
      },
    });
  }

  private fail(err: HttpErrorResponse): void {
    this.error.set(this.msg(err));
  }

  private msg(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
