import { Injectable, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DriversApi } from '../drivers/drivers.api';

/** What is being judged, and how to name it in the prompt. */
export interface ReviewTarget {
  kind: 'document' | 'vehicle';
  id: string;
  label: string;
  /** Only for a vehicle: its owner, which the endpoint needs. */
  driverId?: string;
}

/**
 * The approve/reject verdict over a document or a vehicle, and the prompt that
 * demands a reason before rejecting.
 *
 * It lives in a service because three screens do exactly this — the solicitud
 * detail, the affiliate detail and the affiliate's vehicle page — and the third
 * copy is what pushed `driver-detail.ts` back over the 1000-line limit.
 *
 * Two rules travel with it, so no screen can forget either:
 * - a verdict is only offered while the item is PENDING (a verdict is firm);
 * - rejecting always carries a reason, because the driver reads it in his app to
 *   know exactly what to correct.
 */
@Injectable({ providedIn: 'root' })
export class ReviewPromptService {
  private readonly api = inject(DriversApi);

  /** Non-null while the rejection prompt is open. */
  readonly target = signal<ReviewTarget | null>(null);

  /** A verdict is in flight: freezes the buttons. */
  readonly saving = signal(false);

  /**
   * WHICH item is being judged right now (document or vehicle id), so the
   * spinner sits on the button that was pressed instead of greying out the whole
   * card. With a single global flag every row looked equally busy and none of
   * them showed what was actually happening.
   */
  readonly busyId = signal<string | null>(null);

  isBusy(id: string): boolean {
    return this.busyId() === id;
  }

  reason = '';

  askDocument(id: string, label: string): void {
    this.reason = '';
    this.target.set({ kind: 'document', id, label });
  }

  askVehicle(driverId: string, vehicleId: string, label: string): void {
    this.reason = '';
    this.target.set({ kind: 'vehicle', id: vehicleId, label, driverId });
  }

  close(): void {
    if (this.saving()) return;
    this.target.set(null);
  }

  approveDocument(id: string, done: () => void, fail: (err: HttpErrorResponse) => void): void {
    this.run(this.api.reviewDocument(id, true), id, done, fail);
  }

  approveVehicle(
    driverId: string,
    vehicleId: string,
    done: () => void,
    fail: (err: HttpErrorResponse) => void,
  ): void {
    this.run(this.api.reviewVehicle(driverId, vehicleId, true), vehicleId, done, fail);
  }

  /** Sends the rejection with its reason. Does nothing without one. */
  confirmReject(done: () => void, fail: (err: HttpErrorResponse) => void): void {
    const target = this.target();
    const reason = this.reason.trim();
    if (!target || !reason) return;
    const request =
      target.kind === 'document'
        ? this.api.reviewDocument(target.id, false, reason)
        : this.api.reviewVehicle(target.driverId!, target.id, false, reason);
    this.run(request, target.id, () => {
      this.target.set(null);
      done();
    }, fail);
  }

  private run(
    request: ReturnType<DriversApi['reviewDocument']>,
    targetId: string,
    done: () => void,
    fail: (err: HttpErrorResponse) => void,
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.busyId.set(targetId);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.busyId.set(null);
        done();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.busyId.set(null);
        fail(err);
      },
    });
  }
}
