import type { SelectOption } from '../../shared/components/select';
import {
  PASSWORD_MIN_LENGTH,
  passwordPolicyErrors,
} from '../../shared/directives/password-policy.directive';
import type { CreateDriverInput } from './drivers.api';

/** V = venezolano, E = extranjero, J = jurídico (RIF de empresa). */
export type NationalIdType = 'V' | 'E' | 'J';

export const NATIONAL_ID_OPTIONS: SelectOption[] = [
  { value: 'V', label: 'V', prefix: '🇻🇪' },
  { value: 'E', label: 'E' },
  { value: 'J', label: 'J' },
];

/** Only Venezuela for now; the list is where new countries will land. */
export const PHONE_COUNTRY_OPTIONS: SelectOption[] = [
  { value: '+58', label: '+58', prefix: '🇻🇪' },
];

/**
 * Shared logic of the affiliate personal-data form (wizard step 1 and the
 * profile edit modal): composes the canonical formats the API expects and
 * validates with clear Spanish messages before any request is made.
 */
export interface PersonFormFields {
  firstName: string;
  middleName: string;
  lastName: string;
  secondLastName: string;
  birthDate: string;
  address: string;
  email: string;
  nationalIdType: NationalIdType;
  nationalIdNumber: string;
  /** National number as typed (may carry a leading 0); +58 is fixed for now. */
  phoneNumber: string;
  password: string;
  passwordRepeat: string;
}

export function emptyPersonForm(): PersonFormFields {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    secondLastName: '',
    birthDate: '',
    address: '',
    email: '',
    nationalIdType: 'V',
    nationalIdNumber: '',
    phoneNumber: '',
    password: '',
    passwordRepeat: '',
  };
}

/** Upper bound for the date input: whoever registers must already be 18. */
export function maxBirthDate(): string {
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return limit.toISOString().slice(0, 10);
}

/** "V-12345678" -> parts for editing; null -> defaults. */
export function parseNationalId(value: string | null): { type: NationalIdType; number: string } {
  const match = value?.match(/^([VEJ])-?(\d+)$/i);
  return match
    ? { type: match[1]!.toUpperCase() as NationalIdType, number: match[2]! }
    : { type: 'V', number: '' };
}

/** "+584141234567" -> "4141234567" for the national-number field. */
export function parsePhoneNumber(value: string | null): string {
  return value?.replace(/^\+58/, '') ?? '';
}

export type ComposeResult =
  | { ok: true; input: CreateDriverInput }
  | { ok: false; error: string };

export interface ComposeOptions {
  /**
   * Creation requires document + password (the app login). When editing,
   * an empty password means "keep the current one".
   */
  requireCredentials?: boolean;
}

/**
 * Validates and composes the API payload. Returns an error message (Spanish,
 * ready for the UI) or the composed input - never both.
 */
export function composePerson(f: PersonFormFields, opts: ComposeOptions = {}): ComposeResult {
  if (f.firstName.trim().length < 2 || f.lastName.trim().length < 2) {
    return { ok: false, error: 'Primer nombre y primer apellido son obligatorios (mínimo 2 letras).' };
  }

  if (f.birthDate && f.birthDate > maxBirthDate()) {
    return { ok: false, error: 'El afiliado debe ser mayor de 18 años.' };
  }

  let nationalId: string | null = null;
  if (f.nationalIdNumber.trim()) {
    const digits = f.nationalIdNumber.replace(/\D/g, '');
    if (digits.length < 5 || digits.length > 9) {
      return { ok: false, error: 'El número de documento debe tener entre 5 y 9 dígitos.' };
    }
    nationalId = `${f.nationalIdType}-${digits}`;
  } else if (opts.requireCredentials) {
    // The document IS the app username: no document, no login.
    return {
      ok: false,
      error: 'El documento de identidad es obligatorio: es el usuario de acceso a la app.',
    };
  }

  let phone: string | null = null;
  if (f.phoneNumber.trim()) {
    const digits = f.phoneNumber.replace(/\D/g, '').replace(/^0/, '');
    if (digits.length !== 10) {
      return { ok: false, error: 'El teléfono debe tener 10 dígitos después del +58 (ej. 4141234567).' };
    }
    phone = `+58${digits}`;
  }

  let password: string | null = null;
  if (opts.requireCredentials && !f.password) {
    return {
      ok: false,
      error: `La contraseña de la app es obligatoria (mínimo ${PASSWORD_MIN_LENGTH} caracteres).`,
    };
  }
  if (f.password || f.passwordRepeat) {
    if (f.password !== f.passwordRepeat) {
      return { ok: false, error: 'Las contraseñas no coinciden.' };
    }
    if (!passwordPolicyErrors(f.password).minLength) {
      return {
        ok: false,
        error: `La contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
      };
    }
    if (!nationalId) {
      return {
        ok: false,
        error: 'Para crear la contraseña de la app se necesita el documento (es el usuario de acceso).',
      };
    }
    password = f.password;
  }

  return {
    ok: true,
    input: {
      firstName: f.firstName.trim(),
      middleName: f.middleName.trim() || null,
      lastName: f.lastName.trim(),
      secondLastName: f.secondLastName.trim() || null,
      birthDate: f.birthDate || null,
      address: f.address.trim() || null,
      email: f.email.trim() || null,
      phone,
      nationalId,
      password,
    },
  };
}
