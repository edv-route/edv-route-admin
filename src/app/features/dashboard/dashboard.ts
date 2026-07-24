import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import ApexCharts from 'apexcharts';
import {
  AUDIT_ENTITY_LABELS,
  AUDIT_EVENT_LABELS,
  type AuditLogItem,
} from '../../core/models/audit-log.model';
import type { DashboardSummary, StatTrend } from '../../core/models/dashboard.model';
import { AuditLogsApi } from '../audit/audit-logs.api';
import { DashboardApi, type RevenueSeriesPoint } from './dashboard.api';

const FEED_SIZE = 8;
const REVENUE_DAYS = 30;
/** EDV brand values (styles.css); ApexCharts needs concrete color strings. */
const BRAND_RED = '#920606';
const BRAND_GOLD = '#ebca54';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly api = inject(DashboardApi);
  private readonly auditApi = inject(AuditLogsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly feed = signal<AuditLogItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // Revenue chart (Pro dashboard signature piece), EDV brand colors
  readonly revenueDays = REVENUE_DAYS;
  readonly revenuePoints = signal<RevenueSeriesPoint[] | null>(null);
  readonly revenueTotal = signal('0.00');
  private readonly chartEl = viewChild<ElementRef<HTMLDivElement>>('revenueChart');
  private chart: ApexCharts | null = null;

  constructor() {
    this.api.summary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API',
        );
      },
    });
    this.auditApi
      .list({ page: 1, limit: FEED_SIZE })
      .subscribe((result) => this.feed.set(result.items));

    this.api.revenueSeries(REVENUE_DAYS).subscribe({
      next: (points) => {
        this.revenuePoints.set(points);
        this.revenueTotal.set(
          points.reduce((sum, p) => sum + Number(p.totalUsd), 0).toFixed(2),
        );
      },
      error: () => this.revenuePoints.set([]),
    });

    // Render when both the container and the data exist (zoneless-safe).
    effect(() => {
      const el = this.chartEl()?.nativeElement;
      const points = this.revenuePoints();
      if (!el || !points || this.chart) return;
      this.chart = new ApexCharts(el, this.chartOptions(points));
      void this.chart.render();
    });
    this.destroyRef.onDestroy(() => this.chart?.destroy());
  }

  /** Area chart in EDV brand red with gold markers; neutral grid for both themes. */
  private chartOptions(points: RevenueSeriesPoint[]): ApexCharts.ApexOptions {
    return {
      chart: {
        type: 'area',
        height: 280,
        fontFamily: 'Montserrat, sans-serif',
        toolbar: { show: false },
        zoom: { enabled: false },
        foreColor: '#9ca3af',
      },
      series: [
        {
          name: 'Facturado (USD)',
          data: points.map((p) => ({ x: p.date, y: Number(p.totalUsd) })),
        },
      ],
      colors: [BRAND_RED],
      stroke: { curve: 'smooth', width: 3 },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.03 },
      },
      dataLabels: { enabled: false },
      markers: { size: 0, strokeColors: BRAND_GOLD, hover: { size: 5 } },
      xaxis: {
        type: 'datetime',
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { datetimeUTC: false, format: 'dd/MM' },
        tooltip: { enabled: false },
      },
      yaxis: {
        labels: { formatter: (value: number) => `$${value.toFixed(0)}` },
      },
      grid: { borderColor: 'rgba(156, 163, 175, 0.2)', strokeDashArray: 4 },
      tooltip: {
        x: { format: 'dd/MM/yyyy' },
        y: { formatter: (value: number) => `$${value.toFixed(2)} USD` },
      },
    };
  }

  get hasAlerts(): boolean {
    const s = this.summary();
    if (!s) return false;
    return (
      s.subscriptions.expired > 0 ||
      s.subscriptions.dueSoon > 0 ||
      s.documents.expired > 0 ||
      s.documents.dueSoon > 0 ||
      s.drivers.pending > 0 ||
      s.drivers.suspended > 0 ||
      s.drivers.paused > 0 ||
      s.drivers.overdue > 0 ||
      s.drivers.penalized > 0
    );
  }

  eventLabel(eventType: string): string {
    return AUDIT_EVENT_LABELS[eventType] ?? eventType;
  }

  /** Who/what the feed line is about: driver name when resolved, entity otherwise. */
  feedSubject(item: AuditLogItem): string {
    if (item.driverName) return item.driverName;
    const entity = AUDIT_ENTITY_LABELS[item.entity] ?? item.entity;
    const name = item.data?.['name'];
    return typeof name === 'string' ? `${entity} «${name}»` : entity;
  }

  /** Initials for the feed avatar chip (Pro list pattern). */
  subjectInitials(item: AuditLogItem): string {
    const parts = this.feedSubject(item).trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /**
   * Week-over-week trend (Pro stat-card pattern). Percentage when the previous
   * window has data; absolute delta when it starts from zero; null when both
   * windows are empty (no line shown - an invented 0% would be dishonest).
   */
  private trend(current: number, previous: number, format: 'money' | 'count'): StatTrend | null {
    if (current === 0 && previous === 0) return null;
    const suffix = 'vs 7 días anteriores';
    if (previous === 0) {
      const value = format === 'money' ? `$${current.toFixed(2)}` : `+${current}`;
      return { direction: 'up', label: `${value} ${suffix}` };
    }
    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 0.5) return { direction: 'flat', label: `Sin variación ${suffix}` };
    return {
      direction: pct > 0 ? 'up' : 'down',
      label: `${Math.abs(pct).toFixed(0)}% ${suffix}`,
    };
  }

  /** Invoicing: last 7 days vs the 7 before. */
  revenueTrend(): StatTrend | null {
    const s = this.summary();
    if (!s) return null;
    return this.trend(Number(s.invoicing.last7DaysUsd), Number(s.invoicing.prev7DaysUsd), 'money');
  }

  /** Approvals: driver.approved events, week over week. */
  approvalsTrend(): StatTrend | null {
    const s = this.summary();
    if (!s) return null;
    return this.trend(s.drivers.approvedLast7, s.drivers.approvedPrev7, 'count');
  }
}
