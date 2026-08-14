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

  /** Approved but the tariff start hasn't been set yet → approved but does NOT
   *  operate (no "recibe viajes" until it's started). */
  readonly notStarted = computed(
    () => this.driver().status === 'approved' && !this.driver().tariffStartSetAt,
  );

  /** Mirrors the RELAXED backend approval gate (solicitudes-app): the affiliate is
   *  ENROLLED (has a membership + a tariff, paid OR as debt). Debt no longer blocks
   *  approval — approve and the tariff start are decoupled; the debt is settled by
   *  the payment and the start (which does require debt 0) is set afterwards. */
  readonly canApprove = computed(() => {
    const d = this.driver();
    return !!d.subscription && !!d.membershipPayment;
  });

  /** Tooltip explaining why Aprobar is disabled (empty when it's enabled). */
  readonly approveDisabledReason = computed(() =>
    this.canApprove() ? '' : 'Primero regístrale la membresía y la tarifa (alta o deuda)',
  );

  readonly meta = computed<StatusMeta>(() => {
    const d = this.driver();
    switch (d.status) {
      case 'approved':
        if (this.notStarted())
          return {
            label: 'Aprobado',
            dot: 'bg-green-500',
            desc: this.hasDebt()
              ? 'Aprobado · aún no opera: falta pagar para arrancar la tarifa'
              : 'Aprobado · aún no opera: falta establecer el inicio de la tarifa',
          };
        return {
          label: 'Aprobado',
          dot: 'bg-green-500',
          desc: `Al día · ${d.isAvailable ? 'disponible para viajes' : 'inactivo (no recibe viajes)'}`,
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
        if (!this.canApprove())
          return { label: 'Pendiente', dot: 'bg-gold-400', desc: 'En cola de aprobación · faltan la membresía o la tarifa' };
        if (this.pendingSubmission())
          return {
            label: 'Pendiente',
            dot: 'bg-gold-400',
            desc:
              d.pendingCount > 1
                ? `Listo para aprobar · tiene ${d.pendingCount} pagos en revisión (aprueba cada uno para saldar lo que cubre)`
                : 'Listo para aprobar · tiene un pago en revisión (al aprobarlo salda lo que cubre)',
          };
        if (this.hasDebt())
          return { label: 'Pendiente', dot: 'bg-gold-400', desc: 'Listo para aprobar · quedará aprobado con su deuda de alta' };
        return { label: 'Pendiente', dot: 'bg-gold-400', desc: 'En regla · listo para aprobar' };
    }
  });
}
