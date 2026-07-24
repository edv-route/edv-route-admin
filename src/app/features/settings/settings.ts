import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SETTING_LABELS, type Setting } from '../../core/models/setting.model';
import { SettingsApi } from './settings.api';

/** Common IANA zones for the region; the field also accepts any other. */
const TIMEZONE_OPTIONS = [
  'America/Caracas',
  'America/Bogota',
  'America/New_York',
  'America/Mexico_City',
  'Europe/Madrid',
  'UTC',
];

@Component({
  selector: 'app-settings',
  imports: [FormsModule, DatePipe],
  templateUrl: './settings.html',
})
export class Settings {
  private readonly api = inject(SettingsApi);

  readonly labels = SETTING_LABELS;
  readonly timezones = TIMEZONE_OPTIONS;
  readonly items = signal<Setting[]>([]);
  readonly loading = signal(true);
  readonly savingKey = signal<string | null>(null);
  readonly savedKey = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly editing = signal<Record<string, string>>({});

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.editing.set(Object.fromEntries(items.map((s) => [s.key, String(s.value)])));
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.messageOf(err));
      },
    });
  }

  label(key: string): string {
    return this.labels[key] ?? key;
  }

  isNumeric(setting: Setting): boolean {
    return typeof setting.value === 'number';
  }

  isTimezone(setting: Setting): boolean {
    return setting.key === 'business_timezone';
  }

  draft(key: string): string {
    return this.editing()[key] ?? '';
  }

  setDraft(key: string, value: string): void {
    this.editing.update((current) => ({ ...current, [key]: value }));
    this.savedKey.set(null);
  }

  isDirty(setting: Setting): boolean {
    return this.draft(setting.key) !== String(setting.value);
  }

  save(setting: Setting): void {
    if (this.savingKey() || !this.isDirty(setting)) return;
    const raw = this.draft(setting.key).trim();

    // Numeric keys must stay numeric: the API stores JSON, not text.
    let value: unknown = raw;
    if (this.isNumeric(setting)) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        this.error.set(`${this.label(setting.key)}: debe ser un número entero de 0 o más.`);
        return;
      }
      value = parsed;
    } else if (raw === '') {
      this.error.set(`${this.label(setting.key)}: no puede quedar vacío.`);
      return;
    }

    this.error.set(null);
    this.savingKey.set(setting.key);
    this.api.update(setting.key, value).subscribe({
      next: (updated) => {
        this.savingKey.set(null);
        this.savedKey.set(setting.key);
        this.items.update((items) => items.map((s) => (s.key === updated.key ? updated : s)));
        this.editing.update((current) => ({ ...current, [updated.key]: String(updated.value) }));
      },
      error: (err: HttpErrorResponse) => {
        this.savingKey.set(null);
        this.error.set(this.messageOf(err));
      },
    });
  }

  reset(setting: Setting): void {
    this.setDraft(setting.key, String(setting.value));
  }

  private messageOf(err: HttpErrorResponse): string {
    return (err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API';
  }
}
