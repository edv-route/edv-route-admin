import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ClientDetail as ClientDetailModel } from '../../core/models/client.model';
import { ClientsApi } from './clients.api';
import { Avatar } from '../../shared/components/avatar';

/**
 * One sample trip for the «Viajes» tab (approved proposal, 2026-09-01). The
 * SHAPE is the point: it is the data contract the future trips module must
 * serve — id, status, timeline, route, driver + vehicle, fare breakdown and
 * ratings in BOTH directions. The VALUES are hardcoded and the screen says so
 * out loud; when the module exists, only the data source changes.
 */
export interface SampleTrip {
  id: string;
  dateLabel: string;
  timeLabel: string;
  origin: string;
  originDetail: string;
  destination: string;
  destinationDetail: string;
  distanceKm: string | null;
  durationMin: number | null;
  waitMin: number | null;
  driverName: string | null;
  driverCedula: string | null;
  vehicle: string | null;
  plate: string | null;
  amountUsd: string;
  fareBaseUsd: string | null;
  fareDistanceUsd: string | null;
  paymentMethod: string | null;
  status: 'completed' | 'cancelled';
  /** Client → driver; null when the trip never happened. */
  ratingByClient: number | null;
  commentByClient: string | null;
  /** Driver → client. */
  ratingByDriver: number | null;
  timeline: { time: string; label: string }[];
}

/** The five sample trips of the approved mock-up (Valencia places, marked as EJEMPLO). */
const SAMPLE_TRIPS: SampleTrip[] = [
  {
    id: 'VJ-000125', dateLabel: '30/08/2026', timeLabel: '14:32',
    origin: 'Naguanagua', originDetail: 'Naguanagua, av. Universidad',
    destination: 'C.C. Sambil', destinationDetail: 'C.C. Sambil Valencia, puerta 4',
    distanceKm: '7,8', durationMin: 22, waitMin: 3,
    driverName: 'Pedro Rincón', driverCedula: 'V-12.345.678',
    vehicle: 'Toyota Corolla gris', plate: 'AB123CD',
    amountUsd: '5.00', fareBaseUsd: '2.00', fareDistanceUsd: '3.00', paymentMethod: 'Pago móvil · directo al chofer',
    status: 'completed', ratingByClient: 5, commentByClient: 'Muy amable y puntual.', ratingByDriver: 5,
    timeline: [
      { time: '14:32', label: 'Solicitado desde la app' },
      { time: '14:33', label: 'Aceptado por el chofer' },
      { time: '14:39', label: 'Pasajero a bordo' },
      { time: '15:01', label: 'Viaje finalizado' },
    ],
  },
  {
    id: 'VJ-000119', dateLabel: '28/08/2026', timeLabel: '09:05',
    origin: 'Av. Bolívar Norte', originDetail: 'Av. Bolívar Norte, torre BOD',
    destination: 'U. de Carabobo', destinationDetail: 'Universidad de Carabobo, entrada FaCES',
    distanceKm: '4,2', durationMin: 14, waitMin: 2,
    driverName: 'María Sequera', driverCedula: 'V-9.876.543',
    vehicle: 'Chevrolet Aveo blanco', plate: 'CD456EF',
    amountUsd: '3.50', fareBaseUsd: '2.00', fareDistanceUsd: '1.50', paymentMethod: 'Efectivo',
    status: 'completed', ratingByClient: 4, commentByClient: null, ratingByDriver: 5,
    timeline: [
      { time: '09:05', label: 'Solicitado desde la app' },
      { time: '09:07', label: 'Aceptado por el chofer' },
      { time: '09:12', label: 'Pasajero a bordo' },
      { time: '09:26', label: 'Viaje finalizado' },
    ],
  },
  {
    id: 'VJ-000112', dateLabel: '25/08/2026', timeLabel: '19:47',
    origin: 'C.C. Sambil', originDetail: 'C.C. Sambil Valencia, puerta 2',
    destination: 'Naguanagua', destinationDetail: 'Naguanagua, urb. La Granja',
    distanceKm: '8,1', durationMin: 26, waitMin: 5,
    driverName: 'Pedro Rincón', driverCedula: 'V-12.345.678',
    vehicle: 'Toyota Corolla gris', plate: 'AB123CD',
    amountUsd: '5.00', fareBaseUsd: '2.00', fareDistanceUsd: '3.00', paymentMethod: 'Pago móvil · directo al chofer',
    status: 'completed', ratingByClient: 5, commentByClient: null, ratingByDriver: 4,
    timeline: [
      { time: '19:47', label: 'Solicitado desde la app' },
      { time: '19:49', label: 'Aceptado por el chofer' },
      { time: '19:56', label: 'Pasajero a bordo' },
      { time: '20:22', label: 'Viaje finalizado' },
    ],
  },
  {
    id: 'VJ-000098', dateLabel: '21/08/2026', timeLabel: '07:15',
    origin: 'Naguanagua', originDetail: 'Naguanagua, av. Universidad',
    destination: 'Aeropuerto A. Michelena', destinationDetail: 'Aeropuerto Arturo Michelena, salidas',
    distanceKm: '11,4', durationMin: 31, waitMin: 1,
    driverName: 'José Herrera', driverCedula: 'V-15.222.333',
    vehicle: 'Kia Rio plateado', plate: 'GH789IJ',
    amountUsd: '8.00', fareBaseUsd: '2.00', fareDistanceUsd: '6.00', paymentMethod: 'Efectivo',
    status: 'completed', ratingByClient: 3, commentByClient: 'Llegó un poco tarde.', ratingByDriver: 5,
    timeline: [
      { time: '07:15', label: 'Solicitado desde la app' },
      { time: '07:19', label: 'Aceptado por el chofer' },
      { time: '07:28', label: 'Pasajero a bordo' },
      { time: '07:59', label: 'Viaje finalizado' },
    ],
  },
  {
    id: 'VJ-000090', dateLabel: '19/08/2026', timeLabel: '18:02',
    origin: 'Av. Cedeño', originDetail: 'Av. Cedeño, C.C. Camoruco',
    destination: 'Trigal Norte', destinationDetail: 'Trigal Norte, calle 137',
    distanceKm: null, durationMin: null, waitMin: null,
    driverName: null, driverCedula: null, vehicle: null, plate: null,
    amountUsd: '0.00', fareBaseUsd: null, fareDistanceUsd: null, paymentMethod: null,
    status: 'cancelled', ratingByClient: null, commentByClient: null, ratingByDriver: null,
    timeline: [
      { time: '18:02', label: 'Solicitado desde la app' },
      { time: '18:06', label: 'Cancelado por el pasajero' },
    ],
  },
];

/**
 * The client's detail card (approved proposal, 2026-09-01): «Información»
 * shows ONLY what is real in the database; «Viajes» is a DECLARED mock-up —
 * sample data, marked on screen — whose shape is the future trips contract.
 * The «Suspender» button is disabled on purpose: it reserves its place
 * without pretending to work.
 */
@Component({
  selector: 'app-client-detail',
  imports: [DatePipe, RouterLink, Avatar],
  templateUrl: './client-detail.html',
})
export class ClientDetailPage {
  private readonly api = inject(ClientsApi);
  private readonly route = inject(ActivatedRoute);

  readonly client = signal<ClientDetailModel | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly tab = signal<'info' | 'trips'>('info');
  readonly selectedTrip = signal<SampleTrip | null>(null);

  readonly trips = SAMPLE_TRIPS;
  /** For the star loops in the template. */
  readonly starSlots = [1, 2, 3, 4, 5];

  /** Average of the sample ratings — the number an admin would judge by. */
  readonly sampleAverage = (() => {
    const rated = SAMPLE_TRIPS.filter((t) => t.ratingByClient !== null);
    const sum = rated.reduce((acc, t) => acc + (t.ratingByClient ?? 0), 0);
    return (sum / rated.length).toFixed(1);
  })();

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      this.error.set('Cliente no encontrado');
      return;
    }
    this.api.detail(id).subscribe({
      next: (detail) => {
        this.client.set(detail);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        );
      },
    });
  }

  openTrip(trip: SampleTrip): void {
    this.selectedTrip.set(trip);
  }

  closeTrip(): void {
    this.selectedTrip.set(null);
  }
}
