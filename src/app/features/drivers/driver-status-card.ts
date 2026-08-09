import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { DriverDetail } from '../../core/models/driver.model';

/** Dot color + label + one-line description for the current status. */
interface StatusMeta {
  label: string;
  desc: string;
  dot: string;
}

/**
 * Status card of the affiliate profile: the driver's lifecycle status with a
 * plain-language description, the extra context that belongs to it (availability,
 * origin, registration date, what's missing to approve…) and the STATE actions
 * (approve/reject/suspend/pause/resume/reactivate) in the top-right corner. The
 * parent owns the confirmation dialogs and the requests; this only presents and
 * emits the chosen action. Extracted from `driver-detail` (2026-08-06) to keep
 * that template under the 1000-line cap and give the state its own home.
 */
@Component({
  selector: 'app-driver-status-card',
  // display:contents so the inner card is the direct grid item and stretches to
  // the row height, matching the sibling cards (Membresía / Tarifa).
  host: { class: 'contents' },
  imports: [DatePipe],
  templateUrl: './driver-status-card.html',
})
export class DriverStatusCard {
  readonly driver = input.required<DriverDetail>();
  readonly saving = input(false);

  readonly approve = output<void>();
  readonly reject = output<void>();
  /** Suspend (approved) or reactivate (suspended) — the parent decides by status. */
  readonly suspendToggle = output<void>();
  readonly pause = output<void>();
  readonly resume = output<void>();
  readonly reactivate = output<void>();

  readonly hasDebt = computed(() => Number(this.driver().debt.totalUsd) > 0);
  readonly pendingSubmission = computed(() => this.driver().pendingSubmission);

  readonly meta = computed<StatusMeta>(() => {
    const d = this.driver();
    switch (d.status) {
      case 'approved':
        return {
          label: 'Aprobado',
          dot: 'bg-green-500',
          desc: `Alta aprobada y al día · ${d.isAvailable ? 'disponible para viajes' : 'inactivo (no recibe viajes)'}`,
        };
      case 'scheduled':
        return {
          label: 'Programado',
          dot: 'bg-indigo-500',
          desc: 'Aprobado · su tarifa arranca el próximo lunes (aún no opera)',
        };
      case 'suspended':
        return { label: 'Suspendido', dot: 'bg-red-500', desc: 'Suspendido por el administrador · no opera' };
      case 'rejected':
        return { label: 'Rechazado', dot: 'bg-primary-700', desc: 'Solicitud rechazada por el administrador' };
      case 'paused':
        return { label: 'Pausado', dot: 'bg-blue-500', desc: 'En licencia administrativa · la tarifa está congelada' };
      case 'overdue':
        return {
          label: 'En mora',
          dot: 'bg-amber-500',
          desc: `Debe ${d.debt.weeksOwed} semana(s) de tarifa · sigue operando · lo marca el motor de deuda`,
        };
      case 'penalized':
        return { label: 'Penalizado', dot: 'bg-red-500', desc: 'Superó el tope de semanas en deuda · no opera hasta saldar' };
      default:
        if (this.pendingSubmission())
          return { label: 'Pendiente', dot: 'bg-gold-400', desc: 'Tiene un pago en revisión · apruébalo para poder aprobar el alta' };
        if (this.hasDebt())
          return { label: 'Pendiente', dot: 'bg-gold-400', desc: 'En cola de aprobación · faltan pagos de membresía o tarifa' };
        return { label: 'Pendiente', dot: 'bg-gold-400', desc: 'En regla · listo para aprobar' };
    }
  });
}
