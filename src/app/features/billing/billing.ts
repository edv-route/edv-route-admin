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
import { SkeletonRows } from '../../shared/components/skeleton-rows';
import { DriversApi } from '../drivers/drivers.api';
import { BillingApi, type MonthlyInvoicingPoint } from './billing.api';
import { Pagination } from '../../shared/components/pagination';

const PAGE_SIZE = 10;
const MONTHS = 12;
const BRAND_RED = '#920606';

/**
 * Facturación: the invoices ledger — one invoice per concept (membership or tariff
 * week), with its status and the receipt that paid it. Receipts and the approval
 * inbox moved to the Recibos de pagos screen (2026-08-07); this screen is now
 * invoices-only (monthly chart + status filter + search + per-driver history).
 */
type InvoiceStatusFilter = '' | 'issued' | 'overdue' | 'paid' | 'voided';

@Component({
  selector: 'app-billing',
  imports: [FormsModule, DatePipe, RouterLink, SkeletonRows, Pagination],
  templateUrl: './billing.html',
})
export class Billing {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);

  /** Bound from the query param (withComponentInputBinding) - per-driver history. */
  readonly driverId = input<string>();

  readonly invoiceStatusLabels = INVOICE_STATUS_LABELS;

  readonly invoices = signal<InvoiceListItem[]>([]);
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
      untracked(() => {
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
    this.api
      .invoices({
        ...(this.driverId() ? { driverId: this.driverId() as string } : {}),
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        ...(this.invoiceStatus() ? { status: this.invoiceStatus() } : {}),
        page: this.page(),
        limit: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.invoices.set(result.items);
          this.total.set(result.total);
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
