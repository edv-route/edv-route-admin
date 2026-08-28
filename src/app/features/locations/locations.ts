import { Component, DestroyRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { HttpErrorResponse } from '@angular/common/http';
import { Avatar } from '../../shared/components/avatar';
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import type { LiveLocation, Presence } from '../../core/models/location.model';
import { LocationsApi } from './locations.api';
import { MapView, type MapMarker, type MarkerTone } from './map-view';

/**
 * Live map (proposal:
 * edv-route-backend/docs/proposals/ubicacion-afiliados/fase-4-mapa.md).
 *
 * Chassis copied from the Flowbite Pro logistics homepage — card header, filter
 * toolbar, and the map beside a side list — with the EDV identity already
 * established elsewhere in the panel.
 */

/**
 * How often the panel asks again. Polling, not SSE: the flow is one-way and a
 * plain GET has no server state, no reconnection and no heartbeats. It sits
 * well under the reporting pace, so nothing is ever missed.
 */
const REFRESH_MS = 15_000;

/** Ceiling for the "hide imprecise" switch, in metres. */
const ACCURACY_CEILING_M = 200;

type PresenceFilter = '' | Presence;

@Component({
  selector: 'app-locations',
  imports: [FormsModule, DatePipe, RouterLink, Avatar, SkeletonRows, MapView],
  templateUrl: './locations.html',
})
export class Locations {
  private readonly api = inject(LocationsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapView = viewChild(MapView);

  readonly items = signal<LiveLocation[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Kept apart from `error`: a failed refresh must not blank a working map. */
  readonly staleSince = signal<Date | null>(null);
  /** Set when the map itself could not paint. Never leave a blank rectangle mute. */
  readonly mapProblem = signal<string | null>(null);

  /** Street name of the selected affiliate, resolved on demand. */
  readonly address = signal<string | null>(null);
  readonly addressLoading = signal(false);
  readonly lastUpdate = signal<Date | null>(null);

  readonly presenceFilter = signal<PresenceFilter>('');
  readonly hideImprecise = signal(false);
  readonly selectedId = signal<string | null>(null);
  search = '';
  private readonly searchTerm = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Server-derived thresholds. The legend reads them so it cannot lie. */
  readonly intervalSeconds = signal(600);
  readonly onlineWithinSeconds = signal(1200);
  readonly delayedWithinSeconds = signal(1800);

  readonly accuracyCeiling = ACCURACY_CEILING_M;

  /** Follows the panel theme so the map does not glare in dark mode. */
  readonly dark = signal(document.documentElement.classList.contains('dark'));

  readonly counts = computed(() => {
    const all = this.items();
    return {
      total: all.length,
      online: all.filter((i) => i.presence === 'online').length,
      delayed: all.filter((i) => i.presence === 'delayed').length,
      offline: all.filter((i) => i.presence === 'offline').length,
    };
  });

  readonly visible = computed(() => {
    const presence = this.presenceFilter();
    const term = this.searchTerm().trim().toLowerCase();
    return this.items().filter((item) => {
      if (presence && item.presence !== presence) return false;
      if (!term) return true;
      return (
        item.fullName.toLowerCase().includes(term) ||
        (item.nationalId ?? '').toLowerCase().includes(term)
      );
    });
  });

  readonly markers = computed<MapMarker[]>(() =>
    this.visible().map((item) => ({
      id: item.userId,
      lat: item.lat,
      lon: item.lon,
      tone: item.presence as MarkerTone,
      initials: initialsOf(item.fullName),
    })),
  );

  readonly selected = computed(
    () => this.visible().find((i) => i.userId === this.selectedId()) ?? null,
  );

  /**
   * The error circle, drawn only for the selected affiliate and only when the
   * reading is poor enough to matter. A permanent five-metre ring around every
   * pin is visual noise, not information.
   */
  readonly selectedAccuracy = computed(() => {
    const item = this.selected();
    if (!item || item.accuracyM === null || item.accuracyM < 50) return null;
    return { lat: item.lat, lon: item.lon, radiusM: item.accuracyM };
  });

  constructor() {
    this.load();

    // Polling, paused while the tab is hidden: a panel left open overnight has
    // no business waking the API every fifteen seconds.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.load(true);
    }, REFRESH_MS);

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') this.load(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    // The theme lives as a class on <html>, toggled by the layout.
    const themeWatcher = new MutationObserver(() =>
      this.dark.set(document.documentElement.classList.contains('dark')),
    );
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      themeWatcher.disconnect();
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  /** `silent` is a background refresh: it must never flash the skeleton. */
  load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set(null);
    }
    this.api
      .live(this.hideImprecise() ? { maxAccuracyM: ACCURACY_CEILING_M } : {})
      .subscribe({
        next: (result) => {
          this.items.set(result.items);
          this.intervalSeconds.set(result.intervalSeconds);
          this.onlineWithinSeconds.set(result.onlineWithinSeconds);
          this.delayedWithinSeconds.set(result.delayedWithinSeconds);
          this.loading.set(false);
          this.error.set(null);
          this.staleSince.set(null);
          this.lastUpdate.set(new Date());
          // A selected affiliate who stopped working is no longer on the map.
          if (this.selectedId() && !result.items.some((i) => i.userId === this.selectedId())) {
            this.selectedId.set(null);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          const message =
            (err.error as { message?: string })?.message ?? 'Error de conexión con la API';
          if (silent && this.items().length > 0) {
            // Keep what is on screen. Blanking a map because one refresh failed
            // is worse than showing positions that are a few seconds old.
            if (!this.staleSince()) this.staleSince.set(new Date());
          } else {
            this.error.set(message);
          }
        },
      });
  }

  setPresence(value: PresenceFilter): void {
    this.presenceFilter.set(value);
  }

  toggleImprecise(): void {
    this.hideImprecise.update((v) => !v);
    this.load();
  }

  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.searchTerm.set(this.search), 300);
  }

  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTerm.set(this.search);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.clearSelection();
  }

  /** Dismisses the open card: clicking empty map, or Escape. */
  clearSelection(): void {
    if (this.selectedId() === null) return;
    this.selectedId.set(null);
    this.address.set(null);
  }

  select(userId: string): void {
    this.selectedId.update((current) => (current === userId ? null : userId));
    this.resolveAddress();
  }

  /**
   * Resolves the street for whoever is selected. Asked here and not while
   * drawing the map because the geocoder allows one request per second.
   */
  private resolveAddress(): void {
    const item = this.selected();
    this.address.set(null);
    if (!item) return;
    this.addressLoading.set(true);
    const asked = item.userId;
    this.api.address(item.lat, item.lon).subscribe({
      next: ({ label }) => {
        if (this.selectedId() !== asked) return; // ya se mira a otro
        this.address.set(label);
        this.addressLoading.set(false);
      },
      // A card without a street is fine; a card that breaks is not.
      error: () => this.addressLoading.set(false),
    });
  }

  fitMap(): void {
    this.mapView()?.fitToContent();
  }

  initials(fullName: string): string {
    return initialsOf(fullName);
  }

  /** "hace 4 min", "hace 2 h 05 min". Plain wording, no clock arithmetic on screen. */
  ago(seconds: number): string {
    if (seconds < 60) return 'hace un momento';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `hace ${hours} h ${String(rest).padStart(2, '0')} min`;
  }

  presenceLabel(presence: Presence): string {
    return presence === 'online' ? 'En línea' : presence === 'delayed' ? 'Con retraso' : 'Sin señal';
  }

  /** Minutes, for the legend. Derived from the server thresholds, never fixed. */
  minutesOf(seconds: number): number {
    return Math.round(seconds / 60);
  }

  readonly presenceDotClasses: Record<Presence, string> = {
    online: 'bg-green-500',
    delayed: 'bg-gold-400',
    offline: 'bg-gray-400',
  };

  readonly presenceTextClasses: Record<Presence, string> = {
    online: 'text-green-600',
    delayed: 'text-gold-700',
    offline: 'text-gray-500',
  };

  readonly statusBadgeClasses: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
  };

  statusLabel(status: string): string {
    return status === 'overdue' ? 'En mora' : 'Aprobado';
  }
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
