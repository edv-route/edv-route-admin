import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { HttpErrorResponse } from '@angular/common/http';
import { Avatar } from '../../shared/components/avatar';
import type { DriverDetail } from '../../core/models/driver.model';
import { DriversApi } from '../drivers/drivers.api';
import type { TrailPoint, TrailResult } from '../../core/models/location.model';
import { LocationsApi } from './locations.api';
import { MapView, type MapMarker, type MapTrail } from './map-view';

/**
 * One affiliate's trail for one day (proposal:
 * edv-route-backend/docs/proposals/ubicacion-afiliados/fase-4-mapa.md).
 */

/**
 * Above this, a point did not arrive live: it sat in the phone's local queue
 * while there was no signal. A point taken and delivered normally reaches the
 * server in seconds, so two minutes is a wide margin, not a fine line.
 */
const DELAYED_THRESHOLD_SECONDS = 120;

@Component({
  selector: 'app-driver-trail',
  imports: [FormsModule, DatePipe, RouterLink, Avatar, MapView],
  templateUrl: './driver-trail.html',
})
export class DriverTrail {
  private readonly api = inject(LocationsApi);
  private readonly driversApi = inject(DriversApi);
  private readonly mapView = viewChild(MapView);

  /** Bound from the route (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  readonly driver = signal<DriverDetail | null>(null);
  readonly result = signal<TrailResult | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** The day being looked at, in the browser's own timezone. */
  readonly day = signal<Date>(startOfToday());
  readonly dark = signal(document.documentElement.classList.contains('dark'));

  readonly points = computed(() => this.result()?.points ?? []);
  readonly summary = computed(() => this.result()?.summary ?? null);
  readonly truncated = computed(() => this.result()?.truncated ?? false);

  /** Newest first on screen: the last known position is what gets looked at. */
  readonly timeline = computed(() => [...this.points()].reverse());

  readonly isToday = computed(() => this.day().getTime() === startOfToday().getTime());

  readonly trail = computed<MapTrail | null>(() => {
    const points = this.points();
    if (points.length < 2) return null;
    const path = points.map((p) => [p.lon, p.lat] as [number, number]);

    // The stretch the phone held without signal, as the span between the first
    // and last late point. A single contiguous run is all the map draws today:
    // scattered late points across a day are rare, and pretending otherwise
    // would mean colouring segments that nobody can interpret.
    const lateIndexes = points
      .map((p, i) => (p.delaySeconds > DELAYED_THRESHOLD_SECONDS ? i : -1))
      .filter((i) => i >= 0);
    const first = lateIndexes[0];
    const last = lateIndexes[lateIndexes.length - 1];

    return {
      path,
      delayedFrom: first !== undefined ? Math.max(0, first - 1) : null,
      delayedTo: last !== undefined ? last : null,
    };
  });

  /** Start and end pins of the day. */
  readonly markers = computed<MapMarker[]>(() => {
    const points = this.points();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first) return [];
    const marks: MapMarker[] = [
      { id: 'start', lat: first.lat, lon: first.lon, tone: 'online', initials: 'A' },
    ];
    if (last && last !== first) {
      marks.push({ id: 'end', lat: last.lat, lon: last.lon, tone: 'offline', initials: 'B' });
    }
    return marks;
  });

  constructor() {
    effect(() => {
      const driverId = this.id();
      if (!driverId) return;
      this.driversApi.detail(driverId).subscribe({
        next: (detail) => this.driver.set(detail),
        error: () => this.driver.set(null),
      });
    });

    effect(() => {
      const driverId = this.id();
      const day = this.day();
      if (!driverId) return;
      this.load(driverId, day);
    });

    const themeWatcher = new MutationObserver(() =>
      this.dark.set(document.documentElement.classList.contains('dark')),
    );
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  private load(driverId: string, day: Date): void {
    this.loading.set(true);
    this.error.set(null);
    const from = new Date(day);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);

    this.api.trail(driverId, from, to).subscribe({
      next: (result) => {
        this.result.set(result);
        this.loading.set(false);
        // The camera follows the day being looked at, unlike the live map where
        // re-framing would fight whoever is reading it.
        queueMicrotask(() => this.mapView()?.fitToContent());
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.result.set(null);
        this.error.set(
          (err.error as { message?: string })?.message ?? 'Error de conexión con la API',
        );
      },
    });
  }

  shiftDay(days: number): void {
    const next = new Date(this.day());
    next.setDate(next.getDate() + days);
    if (next.getTime() > startOfToday().getTime()) return;
    this.day.set(next);
  }

  fitMap(): void {
    this.mapView()?.fitToContent();
  }

  /** Whether this point arrived through the queue rather than live. */
  isDelayed(point: TrailPoint): boolean {
    return point.delaySeconds > DELAYED_THRESHOLD_SECONDS;
  }

  /** "2 s", "12 min", "3 h 12 min". Used for how long a point took to arrive. */
  duration(seconds: number): string {
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
  }

  /** Length of the working day, from the first point to the last. */
  readonly span = computed(() => {
    const s = this.summary();
    if (!s?.firstAt || !s.lastAt) return null;
    return this.duration((new Date(s.lastAt).getTime() - new Date(s.firstAt).getTime()) / 1000);
  });

  readonly statusBadgeClasses: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    penalized: 'bg-gold-200 text-gold-800',
    suspended: 'bg-gray-200 text-gray-700',
    paused: 'bg-gray-100 text-gray-600',
  };
}

/** Midnight today, in the browser's timezone — which is the user's day. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
