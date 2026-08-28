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

/**
 * Voyager rather than Positron: same restrained CARTO family, but its streets
 * are drawn with an outline instead of plain white on near-white. Positron is
 * built to disappear under data — which is right for a heat map and wrong here,
 * where the operator needs to recognise the street somebody is standing on.
 */
const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
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

/**
 * Pins closer than this on SCREEN get folded into one group bubble. It is a
 * pixel distance, not a metric one, on purpose: the problem being solved is
 * legibility (two affiliates at the same terminal hide each other), and that
 * depends on zoom, not on how far apart they really are.
 */
const CLUSTER_RADIUS_PX = 34;

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
  /** Group bubbles, rebuilt on every zoom/pan because they are screen-based. */
  private readonly groups: MapLibreMarker[] = [];
  /**
   * The camera is fitted ONCE. Re-fitting on every refresh would yank the view
   * out from under whoever is reading it.
   */
  private fitted = false;
  private styleReady = false;
  /**
   * Theme the CURRENT style was built with. A theme flip that arrives while a
   * style is still loading cannot be applied yet, and without remembering it
   * the map would stay on the wrong style until the user toggled twice.
   */
  private appliedDark = false;

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
      // Not ready yet: style.load reconciles it, so the flip is never lost.
      if (!map || !this.styleReady || dark === this.appliedDark) return;
      this.applyStyle(map, dark);
    });

    effect(() => {
      const marks = this.markers();
      this.selectedId();
      if (!this.map || !this.styleReady) return;
      this.syncMarkers();
      // The affiliates arrive over HTTP, after the style has settled: this is
      // where the one-time initial framing actually becomes possible.
      if (!this.fitted && marks.length > 0) this.fitted = this.fitToContent();
    });

    effect(() => {
      const trail = this.trail();
      this.accuracy();
      if (!this.map || !this.styleReady) return;
      this.paintShapes();
      // A trail is a whole day being swapped in: the camera SHOULD follow it,
      // unlike the live map where re-framing would fight the operator.
      if (trail) this.fitToContent();
    });

    this.destroyRef.onDestroy(() => {
      for (const bubble of this.groups) bubble.remove();
      this.groups.length = 0;
      for (const pin of this.pins.values()) pin.remove();
      this.pins.clear();
      this.map?.remove();
      this.map = null;
    });
  }

  /**
   * Frames every marker (or the whole trail). Returns whether it actually had
   * anything to frame — the caller uses that to decide if the one-time initial
   * fit is done, because marking it done with an empty map means the affiliates
   * arrive later and the camera never goes to them.
   */
  fitToContent(): boolean {
    const map = this.map;
    if (!map) return false;

    const coords: [number, number][] = this.markers().map((m) => [m.lon, m.lat]);
    const trail = this.trail();
    if (trail) coords.push(...trail.path);
    const first = coords[0];
    if (!first) return false;

    if (coords.length === 1) {
      map.easeTo({ center: first, zoom: 15 });
      return true;
    }

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new LngLatBounds(first, first),
    );
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 400 });
    return true;
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

  /** Single path for swapping the basemap style, so the flag cannot drift. */
  private applyStyle(map: MapLibreMap, dark: boolean): void {
    this.appliedDark = dark;
    this.styleReady = false;
    map.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }

  private create(container: HTMLDivElement, dark: boolean): void {
    this.appliedDark = dark;
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
    // Grouping is computed in screen space, so it has to be redone whenever
    // the camera moves. Cheap: it is one projection per affiliate.
    map.on('moveend', () => this.syncMarkers());
    map.on('zoomend', () => this.syncMarkers());

    map.on('style.load', () => {
      this.styleReady = true;
      // The theme may have flipped while this style was in flight.
      if (this.dark() !== this.appliedDark) {
        this.applyStyle(map, this.dark());
        return;
      }
      // Belt and braces: the box may have grown between construction and the
      // style landing, and a stale measurement paints nothing.
      map.resize();
      this.syncMarkers();
      this.paintShapes();
      if (!this.fitted) this.fitted = this.fitToContent();
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
  /**
   * Folds pins that would overlap on screen into one bubble with a count.
   * Single-pin groups stay as normal pins, so with a spread-out fleet nothing
   * changes; the bubbles only appear where affiliates actually pile up.
   */
  private clusterOf(marks: MapMarker[]): { members: MapMarker[]; lat: number; lon: number }[] {
    const map = this.map;
    if (!map) return marks.map((m) => ({ members: [m], lat: m.lat, lon: m.lon }));

    const points = marks.map((m) => ({ m, p: map.project([m.lon, m.lat]) }));
    const taken = new Set<number>();
    const out: { members: MapMarker[]; lat: number; lon: number }[] = [];

    for (let i = 0; i < points.length; i++) {
      if (taken.has(i)) continue;
      taken.add(i);
      const group = [points[i]!];
      for (let j = i + 1; j < points.length; j++) {
        if (taken.has(j)) continue;
        const dx = points[i]!.p.x - points[j]!.p.x;
        const dy = points[i]!.p.y - points[j]!.p.y;
        if (Math.hypot(dx, dy) <= CLUSTER_RADIUS_PX) {
          taken.add(j);
          group.push(points[j]!);
        }
      }
      const members = group.map((g) => g.m);
      out.push({
        members,
        lat: members.reduce((a, m) => a + m.lat, 0) / members.length,
        lon: members.reduce((a, m) => a + m.lon, 0) / members.length,
      });
    }
    return out;
  }

  /** Bubble showing how many affiliates are stacked here. Click zooms in. */
  private buildGroup(group: { members: MapMarker[]; lat: number; lon: number }): void {
    const map = this.map;
    if (!map) return;
    const el = document.createElement("div");
    el.textContent = String(group.members.length);
    el.title = group.members.map((m) => m.initials).join(", ");
    el.style.cssText = [
      "width:38px",
      "height:38px",
      "border-radius:9999px",
      "background:" + BRAND_RED,
      "border:3px solid #ffffff",
      "box-shadow:0 1px 6px rgba(0,0,0,.35)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-size:13px",
      "font-weight:700",
      "font-family:Montserrat,sans-serif",
      "color:#ffffff",
      "cursor:pointer",
      "user-select:none",
    ].join(";");
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      // Zoom in on the pile: at some zoom level they stop overlapping and
      // become individually clickable, which is the whole point.
      map.easeTo({ center: [group.lon, group.lat], zoom: Math.min(map.getZoom() + 2, 18) });
    });
    const bubble = new MapLibreMarker({ element: el }).setLngLat([group.lon, group.lat]);
    bubble.addTo(map);
    this.groups.push(bubble);
  }

  private syncMarkers(): void {
    const map = this.map;
    if (!map) return;

    const selected = this.selectedId();
    const seen = new Set<string>();

    // Bubbles are screen-based: rebuilt from scratch, never reused.
    for (const bubble of this.groups) bubble.remove();
    this.groups.length = 0;

    const clusters = this.clusterOf(this.markers());
    const wanted: MapMarker[] = [];
    for (const group of clusters) {
      // A selected affiliate is never hidden inside a bubble: the panel is
      // showing his card, and a card with no pin makes no sense.
      const holdsSelected = selected !== null && group.members.some((m) => m.id === selected);
      if (group.members.length === 1 || holdsSelected) {
        wanted.push(...group.members);
      } else {
        this.buildGroup(group);
      }
    }

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
