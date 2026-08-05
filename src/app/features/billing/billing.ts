import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import ApexCharts from 'apexcharts';
import { INVOICE_STATUS_LABELS, type InvoiceListItem } from '../../core/models/billing.model';
import {
  SUBMISSION_STATUS_LABELS,
  type SubmissionListItem,
} from '../../core/models/payment-submission.model';
import { DriversApi } from '../drivers/drivers.api';
import { BillingApi, type MonthlyInvoicingPoint } from './billing.api';
import { PaymentSubmissionsApi } from './payment-submissions.api';

const PAGE_SIZE = 20;
const MONTHS = 12;
const BRAND_RED = '#920606';

/**
 * Billing redesign (2026-08-04): a payment RECEIPT covers N invoices (one per
 * concept). The screen has three tabs:
 *  - `receipts` ("Pagos"): the receipts (payment_submissions) — N° pago, pagador,
 *    monto, estado, fecha, detalle.
 *  - `invoices` ("Facturas"): individual per-concept invoices — N°, afiliado,
 *    período, monto, estado, and the receipt that paid them.
 *  - `review` ("Por aprobar"): pending receipts awaiting approval.
 */
type BillingTab = 'receipts' | 'invoices' | 'review';
type InvoiceStatusFilter = '' | 'issued' | 'overdue' | 'paid' | 'voided';

@Component({
  selector: 'app-billing',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './billing.html',
})
export class Billing {
  private readonly api = inject(BillingApi);
  private readonly submissionsApi = inject(PaymentSubmissionsApi);
  private readonly router = inject(Router);

  /** Bound from the query param (withComponentInputBinding) - per-driver history. */
  readonly driverId = input<string>();
  /** Optional starting tab (e.g. ?tab=review after approving a receipt). */
  readonly initialTab = input<string | undefined>(undefined, { alias: 'tab' });

  readonly invoiceStatusLabels = INVOICE_STATUS_LABELS;
  readonly submissionStatusLabels = SUBMISSION_STATUS_LABELS;

  readonly tab = signal<BillingTab>('receipts');
  readonly invoices = signal<InvoiceListItem[]>([]);
  readonly receipts = signal<SubmissionListItem[]>([]);
  readonly submissions = signal<SubmissionListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly driverName = signal<string | null>(null);

  readonly invoiceStatus = signal<InvoiceStatusFilter>('');

  search = '';

  readonly pageSize = PAGE_SIZE;
  readonly months = MONTHS;

  // Monthly invoicing bar chart (global view only)
  private readonly destroyRef = inject(DestroyRef);
  readonly monthlyPoints = signal<MonthlyInvoicingPoint[] | null>(null);
  private readonly chartEl = viewChild<ElementRef<HTMLDivElement>>('monthlyChart');
  private chart: ApexCharts | null = null;

  constructor(driversApi: DriversApi) {
    // Reload whenever the bound driverId changes (including first binding).
    effect(() => {
      const id = this.driverId();
      const t = this.initialTab();
      untracked(() => {
        if (t === 'review' || t === 'invoices' || t === 'receipts') this.tab.set(t);
        this.driverName.set(null);
        if (id) driversApi.detail(id).subscribe((d) => this.driverName.set(d.fullName));
        this.page.set(1);
        this.load();
      });
    });

    this.api.monthlySeries(MONTHS).subscribe({
      next: (points) => this.monthlyPoints.set(points),
      error: () => this.monthlyPoints.set([]),
    });

    // Render once the container (global view) and the data both exist.
    effect(() => {
      const el = this.chartEl()?.nativeElement;
      const points = this.monthlyPoints();
      if (!el || !points || this.chart) return;
      this.chart = new ApexCharts(el, this.chartOptions(points));
      void this.chart.render();
    });
    this.destroyRef.onDestroy(() => this.chart?.destroy());
  }

  private monthLabel(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', {
      month: 'short',
      year: '2-digit',
    });
  }

  /** Column chart in EDV brand red; neutral grid for both themes. */
  private chartOptions(points: MonthlyInvoicingPoint[]): ApexCharts.ApexOptions {
    return {
      chart: {
        type: 'bar',
        height: 260,
        fontFamily: 'Montserrat, sans-serif',
        toolbar: { show: false },
        foreColor: '#9ca3af',
      },
      series: [{ name: 'Facturado (USD)', data: points.map((p) => Number(p.totalUsd)) }],
      colors: [BRAND_RED],
      plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: points.map((p) => this.monthLabel(p.month)),
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { formatter: (value: number) => `$${value.toFixed(0)}` } },
      grid: { borderColor: 'rgba(156, 163, 175, 0.2)', strokeDashArray: 4 },
      tooltip: { y: { formatter: (value: number) => `$${value.toFixed(2)} USD` } },
    };
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(): void {
    this.loading.set(true);
    const common = {
      ...(this.driverId() ? { driverId: this.driverId() as string } : {}),
      ...(this.search.trim() ? { search: this.search.trim() } : {}),
      page: this.page(),
      limit: PAGE_SIZE,
    };
    const onError = (err: HttpErrorResponse): void => {
      this.loading.set(false);
      this.error.set(
        (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
      );
    };

    if (this.tab() === 'invoices') {
      this.api
        .invoices({ ...common, ...(this.invoiceStatus() ? { status: this.invoiceStatus() } : {}) })
        .subscribe({
          next: (result) => {
            this.invoices.set(result.items);
            this.total.set(result.total);
            this.loading.set(false);
          },
          error: onError,
        });
    } else {
      // `receipts` = all receipts; `review` = pending only. (Search not wired yet.)
      this.submissionsApi
        .list({
          ...(this.tab() === 'review' ? { status: 'pending' as const } : {}),
          ...(this.driverId() ? { driverId: this.driverId() as string } : {}),
          page: this.page(),
          limit: PAGE_SIZE,
        })
        .subscribe({
          next: (result) => {
            if (this.tab() === 'review') this.submissions.set(result.items);
            else this.receipts.set(result.items);
            this.total.set(result.total);
            this.loading.set(false);
          },
          error: onError,
        });
    }
  }

  setTab(tab: BillingTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.applyFilters();
  }

  setInvoiceStatus(status: InvoiceStatusFilter): void {
    this.invoiceStatus.set(status);
    this.applyFilters();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  clearDriver(): void {
    void this.router.navigate(['/billing']);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.page.set(page);
    this.load();
  }
}
