import { Directive, forwardRef } from '@angular/core';
import {
  NG_VALIDATORS,
  type AbstractControl,
  type ValidationErrors,
  type Validator,
} from '@angular/forms';

/**
 * Business rule (2026-07-16): min 6 characters, digits-only allowed - the
 * driver's app password may be a PIN. Weaker on purpose: it guards the
 * driver's app, not the admin panel (whose own rule stays at 10+).
 */
export const PASSWORD_MIN_LENGTH = 6;

export function passwordPolicyErrors(value: string): { minLength: boolean } {
  return { minLength: value.length >= PASSWORD_MIN_LENGTH };
}

/**
 * Marks a password control invalid while it breaks the policy, so the field
 * paints red live (global .ng-invalid.ng-touched rule) and the form blocks
 * the submit on its own - the check no longer lives only in composePerson().
 * An empty value stays valid here; `required` decides whether it may be
 * empty (mandatory on creation, "keep current" when editing).
 */
@Directive({
  selector: '[appPasswordPolicy]',
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => PasswordPolicyDirective),
      multi: true,
    },
  ],
})
export class PasswordPolicyDirective implements Validator {
  validate(control: AbstractControl): ValidationErrors | null {
    const value = (control.value as string | null) ?? '';
    if (!value) return null;

    const checks = passwordPolicyErrors(value);
    return checks.minLength ? null : { passwordPolicy: checks };
  }
}
