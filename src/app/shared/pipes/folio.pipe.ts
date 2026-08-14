import { Pipe, type PipeTransform } from '@angular/core';

/**
 * Zero-pads a document number to `length` digits for DISPLAY ONLY (never changes
 * the stored value): 15 → "00015". Numbers already longer than `length` are left
 * intact. Shared by the pipe (templates) and any string built in a component.
 */
export function padFolio(value: string | number, length = 5): string {
  const raw = String(value ?? '').trim();
  return raw.length >= length ? raw : raw.padStart(length, '0');
}

/**
 * Formats invoice / receipt numbers with leading zeros (5 digits by default).
 * Accepts a single number or an array (joined with ", "): `15 → 00015`,
 * `[15, 14] → "00015, 00014"`. Purely cosmetic — the continuous numbering
 * (regla #7) is untouched; this only pads how it reads.
 */
@Pipe({ name: 'folio' })
export class FolioPipe implements PipeTransform {
  transform(
    value: string | number | readonly (string | number)[] | null | undefined,
    length = 5,
  ): string {
    if (value === null || value === undefined) return '';
    return Array.isArray(value)
      ? value.map((v) => padFolio(v, length)).join(', ')
      : padFolio(value as string | number, length);
  }
}
