import type { SelectOption } from '../../shared/components/select';

/**
 * Year options for the vehicle forms: from next model year (vehicles are sold
 * ahead of the calendar) down ~100 years. A dropdown replaces the free number
 * input so the year can never be mistyped (decision 2026-07-31). The backend
 * `year` schema is widened to 1900–2100 so any pick here always validates.
 */
export function vehicleYearOptions(): SelectOption[] {
  const top = new Date().getFullYear() + 1;
  const options: SelectOption[] = [];
  for (let year = top; year >= top - 101; year--) {
    options.push({ value: year, label: String(year) });
  }
  return options;
}
