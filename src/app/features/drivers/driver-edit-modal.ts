import { Component, inject, input, output, signal, viewChild, type OnInit } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, type NgForm } from '@angular/forms';
import type { DriverDetail } from '../../core/models/driver.model';
import { BusyDirective } from '../../shared/directives/busy.directive';
import { DatePicker } from '../../shared/components/date-picker';
import { PasswordInput } from '../../shared/components/password-input';
import { Select } from '../../shared/components/select';
import { INPUT_FILTERS } from '../../shared/directives/input-filters';
import { DriversApi } from './drivers.api';
import {
  NATIONAL_ID_OPTIONS,
  PHONE_COUNTRY_OPTIONS,
  PHONE_OPERATOR_OPTIONS,
  composePerson,
  emptyPersonForm,
  maxBirthDate,
  parseNationalId,
  parsePhone,
} from './person-form';

/**
 * "Editar datos" of an affiliate: names, cédula, birth date, contact and the
 * app password. Extracted from the affiliate profile (2026-11-13) — the
 * profile had passed the 1000-line cap — with its form and its save, so the
 * profile only opens it and reloads on `saved`.
 */
@Component({
  selector: 'app-driver-edit-modal',
  imports: [FormsModule, Select, ...INPUT_FILTERS, PasswordInput, DatePicker, BusyDirective],
  templateUrl: './driver-edit-modal.html',
})
export class DriverEditModal implements OnInit {
  private readonly api = inject(DriversApi);

  readonly driver = input.required<DriverDetail>();
  readonly saved = output<void>();
  readonly cancel = output<void>();

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  person = emptyPersonForm();
  readonly maxBirthDate = maxBirthDate();
  readonly nationalIdOptions = NATIONAL_ID_OPTIONS;
  readonly phoneCountryOptions = PHONE_COUNTRY_OPTIONS;
  readonly phoneOperatorOptions = PHONE_OPERATOR_OPTIONS;
  private readonly editForm = viewChild<NgForm>('editForm');

  ngOnInit(): void {
    const d = this.driver();
    const nationalId = parseNationalId(d.nationalId);
    const phone = parsePhone(d.phone);
    this.person = {
      ...emptyPersonForm(),
      firstName: d.firstName,
      middleName: d.middleName ?? '',
      lastName: d.lastName,
      secondLastName: d.secondLastName ?? '',
      birthDate: d.birthDate?.slice(0, 10) ?? '',
      address: d.address ?? '',
      email: d.email ?? '',
      nationalIdType: nationalId.type,
      nationalIdNumber: nationalId.number,
      phoneOperator: phone.operator,
      phoneNumber: phone.number,
      // Password fields stay empty: blank = keep the current app password
    };
  }

  save(): void {
    if (this.saving()) return;

    const form = this.editForm();
    if (form?.invalid) {
      form.control.markAllAsTouched();
      this.error.set('Revisa los campos marcados en rojo.');
      return;
    }

    const result = composePerson(this.person);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api.update(this.driver().userId, result.input).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set((err.error as { message?: string } | null)?.message ?? 'Error de conexión con la API');
      },
    });
  }
}
