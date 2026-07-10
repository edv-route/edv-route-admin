import { Component } from '@angular/core';

interface StatCard {
  label: string;
  value: string;
  hint: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  /** Placeholder figures until the API dashboard endpoints exist. */
  readonly stats: StatCard[] = [
    { label: 'Afiliados activos', value: '—', hint: 'Con membresía y tarifa vigentes' },
    { label: 'Solicitudes pendientes', value: '—', hint: 'Registros en cola de aprobación' },
    { label: 'Pagos de la semana', value: '—', hint: 'Membresías + tarifas facturadas' },
    { label: 'Documentos por vencer', value: '—', hint: 'Próximos 30 días' },
  ];
}
