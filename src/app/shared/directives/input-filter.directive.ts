import { Directive, forwardRef, HostListener, ElementRef, inject } from '@angular/core';
import {
  NG_VALIDATORS,
  type AbstractControl,
  type ValidationErrors,
  type Validator,
} from '@angular/forms';

/**
 * Live input sanitisers + validators for template-driven forms. Each directive
 * does two things: (1) strips forbidden characters as the user types (so the
 * field can never *hold* garbage), and (2) registers as an NG_VALIDATOR so the
 * control also reads invalid — the global `.ng-invalid.ng-touched` rule paints
 * it red and the submit blocks. Both layers matter: the filter is UX, the
 * validator is the guarantee (a paste that slips through, autofill, etc.).
 *
 * Character classes are kept in sync with the backend JSON Schema patterns
 * (drivers.routes.ts / payment-methods): the panel must never accept something
 * the API would reject.
 *
 * NOTE: a validator directive must NOT inject NgControl (it causes a circular
 * DI with the NgModel that collects NG_VALIDATORS). To sync the model after a
 * live edit we rewrite `el.value` and re-dispatch a native `input` event, which
 * the DefaultValueAccessor already listens to. The guard `cleaned === value`
 * stops the re-dispatch from recursing.
 */
/**
 * Live sanitiser: strips forbidden chars and, when a `separators` class is
 * given, also collapses a run of adjacent separators to the first one and drops
 * a leading separator — a name/model never has "--", "  " or "-'" nor starts
 * with a separator. A single trailing separator is left so the user can keep
 * typing the next word ("Ana-" → "Maria"); the validator rejects it until then.
 */
function liveFilter(el: HTMLInputElement, forbidden: RegExp, separators?: RegExp): void {
  let cleaned = el.value.replace(forbidden, '');
  if (separators) {
    cleaned = cleaned.replace(separators, (run) => run[0]!).replace(/^[\s'-]+/, '');
  }
  if (cleaned === el.value) return;
  el.value = cleaned;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const nonEmpty = (control: AbstractControl): string => ((control.value as string | null) ?? '').trim();

/**
 * Person names: letters (incl. Spanish accents and ñ), spaces, hyphen and
 * apostrophe — enough for real compound names ("De La Cruz", "Ángel-María",
 * "O'Brien"), nothing else. Digits and symbols are blocked. Mirrors the
 * backend name pattern.
 */
const NAME_ALLOWED = /[^\p{L} '-]/gu;
const NAME_SEPARATORS = /[ '-]{2,}/g;
// Starts and ends with a letter; each separator sits between letters, never
// doubled — rejects "Ana--", "-Ana", "Ana-" and "  ".
const NAME_VALID = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

@Directive({
  selector: '[appLetters]',
  providers: [{ provide: NG_VALIDATORS, useExisting: forwardRef(() => LettersOnlyDirective), multi: true }],
})
export class LettersOnlyDirective implements Validator {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  @HostListener('input')
  onInput(): void {
    liveFilter(this.el.nativeElement, NAME_ALLOWED, NAME_SEPARATORS);
  }

  validate(control: AbstractControl): ValidationErrors | null {
    const value = nonEmpty(control);
    if (!value) return null; // `required` decides emptiness
    return NAME_VALID.test(value) ? null : { letters: true };
  }
}

/** Digits only (cédula number, phone number, account number). */
@Directive({
  selector: '[appDigits]',
  providers: [{ provide: NG_VALIDATORS, useExisting: forwardRef(() => DigitsOnlyDirective), multi: true }],
})
export class DigitsOnlyDirective implements Validator {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  @HostListener('input')
  onInput(): void {
    liveFilter(this.el.nativeElement, /\D/g);
  }

  validate(control: AbstractControl): ValidationErrors | null {
    const value = nonEmpty(control);
    if (!value) return null;
    return /^\d+$/.test(value) ? null : { digits: true };
  }
}

/**
 * Alphanumeric + space (payment reference): letters and digits, no symbols.
 * A transfer/pago-móvil reference is a code, never punctuation. Mirrors the
 * backend reference pattern.
 */
const ALNUM_ALLOWED = /[^\p{L}\p{N} ]/gu;
const ALNUM_SEPARATORS = / {2,}/g;
const ALNUM_VALID = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;

@Directive({
  selector: '[appAlnum]',
  providers: [{ provide: NG_VALIDATORS, useExisting: forwardRef(() => AlnumDirective), multi: true }],
})
export class AlnumDirective implements Validator {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  @HostListener('input')
  onInput(): void {
    liveFilter(this.el.nativeElement, ALNUM_ALLOWED, ALNUM_SEPARATORS);
  }

  validate(control: AbstractControl): ValidationErrors | null {
    const value = nonEmpty(control);
    if (!value) return null;
    return ALNUM_VALID.test(value) ? null : { alnum: true };
  }
}

/**
 * Vehicle brand/model: letters, digits, space and hyphen — real model names
 * carry numbers ("Mazda 3", "F-150", "Clase A"). Only symbols are blocked.
 */
const MODEL_ALLOWED = /[^\p{L}\p{N} -]/gu;
const MODEL_SEPARATORS = /[ -]{2,}/g;
const MODEL_VALID = /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*$/u;

@Directive({
  selector: '[appAlnumDash]',
  providers: [{ provide: NG_VALIDATORS, useExisting: forwardRef(() => AlnumDashDirective), multi: true }],
})
export class AlnumDashDirective implements Validator {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  @HostListener('input')
  onInput(): void {
    liveFilter(this.el.nativeElement, MODEL_ALLOWED, MODEL_SEPARATORS);
  }

  validate(control: AbstractControl): ValidationErrors | null {
    const value = nonEmpty(control);
    if (!value) return null;
    return MODEL_VALID.test(value) ? null : { alnumDash: true };
  }
}
