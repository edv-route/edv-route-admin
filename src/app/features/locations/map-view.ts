import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';

/**
 * The map itself, wrapped so neither screen has to know MapLibre exists.
 *
 * Mounted by hand rather than through an Angular wrapper package, following the
 * precedent this panel already set with ApexCharts in the dashboard: one less
 * dependency to keep aligned with Angular's release train, and the zoneless
 * pattern (viewChild + effect + destroyRef) is identical.
 *
 * Base map is CARTO's vector style: the only hosted free tier that documents
 * commercial use, and its TileJSON carries the CARTO + OpenStreetMap credit the
 * licence requires, which MapLibre renders on its own.
 */

/**
 * Where the tile-processing worker lives.
 *
 * MapLibre derives this from its own module URL, which after bundling
 * points at an Angular chunk — so it asks for a file the build never emitted.
 * The request then 404s (dev) or is answered with index.html by the SPA
 * fallback (production), and MapLibre goes quiet: it loads the style, the tile
 * index and the sprites on the main thread and never requests a single tile,
 * painting an empty canvas WITHOUT raising an error. Pointing it at a copy we
 * do emit (see angular.json assets) is what makes the map draw at all.
 */
const WORKER_URL = 'assets/maplibre-gl-worker.mjs';
setWorkerUrl(new URL(WORKER_URL, document.baseURI).href);

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** Caracas. Only ever seen when there is nothing to fit the camera to. */
const FALLBACK_CENTER: [number, number] = [-66.9036, 10.4806];
const FALLBACK_ZOOM = 11;

export type MarkerTone = 'online' | 'delayed' | 'offline';

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  tone: MarkerTone;
  /** Two initials, shown inside the pin. */
  initials: string;
}

/** A trail, already split by the screen into observed and reconstructed parts. */
export interface MapTrail {
  /** Ordered oldest → newest. */
  path: [number, number][];
  /** Segment indices that arrived late (from inclusive, to exclusive). */
  delayedFrom: number | null;
  delayedTo: number | null;
}

const TONE_COLORS: Record<MarkerTone, string> = {
  online: '#22c55e',
  delayed: '#ebca54',
  offline: '#9ca3af',
};

/** EDV brand values (styles.css). MapLibre needs concrete color strings. */
const BRAND_RED = '#920606';
const BRAND_GOLD = '#ebca54';

const TRAIL_SOURCE = 'edv-trail';
const ACCURACY_SOURCE = 'edv-accuracy';

@Component({
  selector: 'app-map-view',
  // Absolute rather than h-full: a percentage height depends on every
  // ancestor resolving one, and MapLibre measures the container the moment it
  // is constructed. Anchoring to the positioned parent removes that chain.
  template: `<div #host style="position:absolute;inset:0"></div>`,
  host: { style: 'position:absolute;inset:0' },
})
export class MapView {
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = viewChild<ElementRef<HTMLDivElement>>('host');

  readonly markers = input<MapMarker[]>([]);
  readonly trail = input<MapTrail | null>(null);
  /** Error circle of the selected affiliate, in metres. Drawn only when asked. */
  readonly accuracy = input<{ lat: number; lon: number; radiusM: number } | null>(null);
  readonly selectedId = input<string | null>(null);
  readonly dark = input(false);

  readonly markerSelect = output<string>();
  /** Fires when the map ended up painting nothing, with the measurements. */
  readonly renderProblem = output<string>();

  private map: MapLibreMap | null = null;
  private readonly pins = new Map<string, MapLibreMarker>();
  /**
   * The camera is fitted ONCE. Re-fitting on every refresh would yank the view
   * out from under whoever is reading it.
   */
  private fitted = false;
  private styleReady = false;

  constructor() {
    effect(() => {
      const el = this.hostEl()?.nativeElement;
      if (!el || this.map) return;
      this.createWhenSized(el);
    });

    // Theme swap. setStyle drops every source and layer, so everything gets
    // painted again once the new style settles (see the style.load handler).
    effect(() => {
      const dark = this.dark();
      const map = this.map;
      if (!map || !this.styleReady) return;
      this.styleReady = false;
      map.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
    });

    effect(() => {
      this.markers();
      this.selectedId();
      if (this.map && this.styleReady) this.syncMarkers();
    });

    effect(() => {
      this.trail();
      this.accuracy();
      if (this.map && this.styleReady) this.paintShapes();
    });

    this.destroyRef.onDestroy(() => {
      for (const pin of this.pins.values()) pin.remove();
      this.pins.clear();
      this.map?.remove();
      this.map = null;
    });
  }

  /** Frames every marker (or the whole trail). First paint, and the button. */
  fitToContent(): void {
    const map = this.map;
    if (!map) return;

    const coords: [number, number][] = this.markers().map((m) => [m.lon, m.lat]);
    const trail = this.trail();
    if (trail) coords.push(...trail.path);
    const first = coords[0];
    if (!first) return;

    if (coords.length === 1) {
      map.easeTo({ center: first, zoom: 15 });
      return;
    }

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new LngLatBounds(first, first),
    );
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 400 });
  }

  /**
   * MapLibre measures its container ONCE, in the constructor. Built against a
   * container that still measures zero, it keeps a zero-sized canvas: the DOM
   * chrome (controls, attribution) lays out correctly against the real box, so
   * the map looks alive while painting nothing and projecting every marker to
   * the origin. Waiting for a real size removes that whole class of failure
   * instead of trying to repair it afterwards.
   */
  private createWhenSized(container: HTMLDivElement): void {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      this.create(container, this.dark());
      return;
    }
    const pending = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        pending.disconnect();
        this.create(container, this.dark());
      }
    });
    pending.observe(container);
    this.destroyRef.onDestroy(() => pending.disconnect());
  }

  private create(container: HTMLDivElement, dark: boolean): void {
    const map = new MapLibreMap({
      container,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      // A supervision panel: tilting and rotating the camera only makes
      // positions harder to compare against each other.
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.touchZoomRotate.disableRotation();

    // Fires on first load AND after every setStyle, which is exactly when the
    // sources and layers need putting back.
    map.on('style.load', () => {
      this.styleReady = true;
      // Belt and braces: the box may have grown between construction and the
      // style landing, and a stale measurement paints nothing.
      map.resize();
      this.syncMarkers();
      this.paintShapes();
      if (!this.fitted) {
        this.fitted = true;
        this.fitToContent();
      }
      this.reportIfBlank(map, container);
    });

    // A map created while its container is still settling keeps a zero-sized
    // canvas and paints nothing until something tells it to measure again.
    const resizer = new ResizeObserver(() => map.resize());
    resizer.observe(container);
    this.destroyRef.onDestroy(() => resizer.disconnect());

    // Without this, a failing style or tile is a blank white rectangle with
    // no clue anywhere.
    map.on('error', (event) => {
      // eslint-disable-next-line no-console
      console.error('[map] ', event.error?.message ?? event);
    });

    // SONDA TEMPORAL de diagnostico: se retira en cuanto el mapa pinte.
    (window as unknown as { __edvMap?: unknown }).__edvMap = map;
    this.map = map;
  }

  /**
   * A map that renders nothing has to SAY so. A blank rectangle is
   * indistinguishable from "there is nothing to show here", and that ambiguity
   * is exactly what makes this kind of failure expensive to chase.
   */
  private reportIfBlank(map: MapLibreMap, container: HTMLDivElement): void {
    requestAnimationFrame(() => {
      const canvas = map.getCanvas();
      if (canvas.width > 0 && canvas.height > 0) return;
      this.renderProblem.emit(
        `El mapa no pudo dibujarse (lienzo ${canvas.width}x${canvas.height}, ` +
          `caja ${container.clientWidth}x${container.clientHeight}).`,
      );
    });
  }

  /**
   * Moves the pins that already exist and only creates the genuinely new ones.
   * Wiping and rebuilding every marker on each refresh is what makes a panel
   * feel slow — far more than the number of markers ever does.
   */
  private syncMarkers(): void {
    const map = this.map;
    if (!map) return;

    const wanted = this.markers();
    const selected = this.selectedId();
    const seen = new Set<string>();

    for (const marker of wanted) {
      seen.add(marker.id);
      const existing = this.pins.get(marker.id);
      if (existing) {
        existing.setLngLat([marker.lon, marker.lat]);
        this.styleElement(existing.getElement(), marker, marker.id === selected);
        continue;
      }
      const el = document.createElement('div');
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.markerSelect.emit(marker.id);
      });
      this.styleElement(el, marker, marker.id === selected);
      const pin = new MapLibreMarker({ element: el }).setLngLat([marker.lon, marker.lat]);
      pin.addTo(map);
      this.pins.set(marker.id, pin);
    }

    for (const [id, pin] of this.pins) {
      if (!seen.has(id)) {
        pin.remove();
        this.pins.delete(id);
      }
    }
  }

  private styleElement(el: HTMLElement, marker: MapMarker, selected: boolean): void {
    const size = selected ? 34 : 26;
    el.textContent = marker.initials;
    el.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      'border-radius:9999px',
      `background:${selected ? BRAND_RED : TONE_COLORS[marker.tone]}`,
      'border:3px solid #ffffff',
      `box-shadow:0 1px 4px rgba(0,0,0,.35)${selected ? ',0 0 0 8px rgba(146,6,6,.18)' : ''}`,
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `font-size:${selected ? 11 : 10}px`,
      'font-weight:700',
      'font-family:Montserrat,sans-serif',
      'color:#ffffff',
      'cursor:pointer',
      'user-select:none',
    ].join(';');
  }

  /** Trail lines and the accuracy circle, as GeoJSON sources. */
  private paintShapes(): void {
    const map = this.map;
    if (!map) return;

    const trailData = this.trailGeoJson(this.trail());
    const trailSource = map.getSource(TRAIL_SOURCE) as GeoJSONSource | undefined;
    if (trailSource) {
      trailSource.setData(trailData);
    } else {
      map.addSource(TRAIL_SOURCE, { type: 'geojson', data: trailData });
      map.addLayer({
        id: `${TRAIL_SOURCE}-halo`,
        type: 'line',
        source: TRAIL_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
      });
      // Two layers instead of one with a data-driven dash: `line-dasharray` is
      // not a data-driven property, so a `case` expression there is silently
      // ignored. A filter per layer is the supported way to say this.
      map.addLayer({
        id: `${TRAIL_SOURCE}-live`,
        type: 'line',
        source: TRAIL_SOURCE,
        filter: ['!', ['get', 'delayed']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': BRAND_RED, 'line-width': 4 },
      });
      map.addLayer({
        id: `${TRAIL_SOURCE}-delayed`,
        type: 'line',
        source: TRAIL_SOURCE,
        filter: ['get', 'delayed'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Dashed on purpose: this stretch was held in the phone and delivered
        // later, so it is reconstructed rather than observed live.
        paint: { 'line-color': BRAND_GOLD, 'line-width': 4, 'line-dasharray': [2, 1.5] },
      });
    }

    const circleData = this.circleGeoJson(this.accuracy());
    const circleSource = map.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined;
    if (circleSource) {
      circleSource.setData(circleData);
    } else {
      map.addSource(ACCURACY_SOURCE, { type: 'geojson', data: circleData });
      map.addLayer({
        id: `${ACCURACY_SOURCE}-fill`,
        type: 'fill',
        source: ACCURACY_SOURCE,
        paint: { 'fill-color': BRAND_RED, 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: `${ACCURACY_SOURCE}-outline`,
        type: 'line',
        source: ACCURACY_SOURCE,
        paint: { 'line-color': BRAND_RED, 'line-width': 1.5, 'line-dasharray': [3, 2] },
      });
    }
  }

  /**
   * Splits the path into runs of segments that share a kind, so one source can
   * feed both line layers. Segment `i` joins `path[i]` and `path[i + 1]`.
   */
  private trailGeoJson(trail: MapTrail | null): FeatureCollection {
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    if (!trail || trail.path.length < 2) return empty;

    const { path, delayedFrom, delayedTo } = trail;
    const isDelayed = (segment: number): boolean =>
      delayedFrom !== null && delayedTo !== null && segment >= delayedFrom && segment < delayedTo;

    const features: Feature[] = [];
    let start = 0;
    for (let segment = 0; segment < path.length - 1; segment++) {
      const isLast = segment === path.length - 2;
      if (isLast || isDelayed(segment + 1) !== isDelayed(segment)) {
        features.push({
          type: 'Feature',
          properties: { delayed: isDelayed(start) },
          geometry: { type: 'LineString', coordinates: path.slice(start, segment + 2) },
        });
        start = segment + 1;
      }
    }
    return { type: 'FeatureCollection', features };
  }

  /**
   * The GPS error margin as a real circle on the ground.
   *
   * A 64-sided polygon rather than a styled point, because a point's radius is
   * in pixels: it would keep its screen size as you zoom, which is exactly the
   * opposite of what a margin of error means.
   */
  private circleGeoJson(
    circle: { lat: number; lon: number; radiusM: number } | null,
  ): FeatureCollection {
    if (!circle) return { type: 'FeatureCollection', features: [] };

    const sides = 64;
    const latRad = (circle.lat * Math.PI) / 180;
    const dLat = circle.radiusM / 111320;
    const dLon = circle.radiusM / (111320 * Math.max(Math.cos(latRad), 0.01));
    const ring: [number, number][] = [];
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      ring.push([circle.lon + dLon * Math.cos(angle), circle.lat + dLat * Math.sin(angle)]);
    }
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
      ],
    };
  }
}
