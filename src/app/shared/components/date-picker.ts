import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  type AbstractControl,
  type ValidationErrors,
  type Validator,
} from '@angular/forms';
import { Datepicker } from 'flowbite-datepicker';

/** Pads to two digits for the ISO conversion. */
const pad = (n: number): string => String(n).padStart(2, '0');

/** ISO yyyy-MM-dd → display dd/mm/yyyy, or '' when empty. */
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Masks free digits into dd/mm/yyyy as the user types (slashes auto-inserted,
 * capped at 8 digits). Typed slashes/letters are ignored — only digits count.
 */
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += '/' + d.slice(2, 4);
  if (d.length > 4) out += '/' + d.slice(4, 8);
  return out;
}

/**
 * A complete dd/mm/yyyy string → ISO yyyy-MM-dd, or null if incomplete or not a
 * real calendar date (rejects 31/02, month 13, etc.).
 */
function displayToIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const dd = +m[1]!, mm = +m[2]!, yyyy = +m[3]!;
  const date = new Date(yyyy, mm - 1, dd);
  const real = date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
  return real ? `${yyyy}-${pad(mm)}-${pad(dd)}` : null;
}

/**
 * Brand date picker built on the Flowbite datepicker (replaces the native date
 * input, whose calendar popup cannot be styled). The field is **editable**: the
 * user may type the date in dd/mm/yyyy (masked live) OR pick it on the calendar;
 * either way the model travels as ISO `yyyy-MM-dd` (the API format) or '' when
 * empty. It is also an NG_VALIDATOR: an incomplete/impossible date, or one past
 * `max`, marks the control invalid (global `.ng-invalid.ng-touched` paints it red
 * and blocks the submit). `updateOnBlur:false` keeps the typed text so the error
 * is visible instead of being silently cleared.
 */
@Component({
  selector: 'app-date-picker',
  template: `
    <div class="relative">
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" d="M5 5c.6 0 1-.4 1-1a1 1 0 1 1 2 0c0 .6.4 1 1 1h1c.6 0 1-.4 1-1a1 1 0 1 1 2 0c0 .6.4 1 1 1h1c.6 0 1-.4 1-1a1 1 0 1 1 2 0c0 .6.4 1 1 1a2 2 0 0 1 2 2v1c0 .6-.4 1-1 1H4a1 1 0 0 1-1-1V7c0-1.1.9-2 2-2ZM3 19v-7c0-.6.4-1 1-1h16c.6 0 1 .4 1 1v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm6-6c0-.6-.4-1-1-1a1 1 0 1 0 0 2c.6 0 1-.4 1-1Zm2 0a1 1 0 1 1 2 0c0 .6-.4 1-1 1a1 1 0 0 1-1-1Zm6 0c0-.6-.4-1-1-1a1 1 0 1 0 0 2c.6 0 1-.4 1-1ZM7 17a1 1 0 1 1 2 0c0 .6-.4 1-1 1a1 1 0 0 1-1-1Zm6 0c0-.6-.4-1-1-1a1 1 0 1 0 0 2c.6 0 1-.4 1-1Zm2 0a1 1 0 1 1 2 0c0 .6-.4 1-1 1a1 1 0 0 1-1-1Z" clip-rule="evenodd" />
        </svg>
      </div>
      <input
        #field
        type="text"
        inputmode="numeric"
        maxlength="10"
        autocomplete="off"
        [id]="inputId()"
        [attr.name]="name() || null"
        [placeholder]="placeholder()"
        (input)="onType()"
        (changeDate)="onPicked()"
        (blur)="onTouched()"
        class="block h-[42px] w-full rounded-lg border border-gray-300 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:border-primary-700 focus:ring-primary-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
      />
    </div>
  `,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePicker), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DatePicker), multi: true },
  ],
})
export class DatePicker implements ControlValueAccessor, Validator, AfterViewInit, OnDestroy {
  readonly inputId = input('');
  readonly name = input('');
  readonly placeholder = input('dd/mm/aaaa');
  /** Upper bound as ISO yyyy-MM-dd (e.g. adulthood limit for birth dates). */
  readonly max = input<string | null>(null);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private picker: Datepicker | null = null;
  /** ISO value ('' = empty / no valid date), pending until the picker exists. */
  private value = '';
  /** Whatever is currently shown; used by validate() to flag a bad typed date. */
  private raw = '';

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  ngAfterViewInit(): void {
    const max = this.max();
    this.picker = new Datepicker(this.field().nativeElement, {
      format: 'dd/mm/yyyy',
      autohide: true,
      todayHighlight: true,
      // Anchor below the field so it doesn't float to the top inside modals
      orientation: 'bottom left',
      // Keep the user's typed text on blur so an invalid date stays visible
      // (we own the parsing/validation, not the picker).
      updateOnBlur: false,
      ...(max ? { maxDate: new Date(`${max}T00:00:00`) } : {}),
    } as ConstructorParameters<typeof Datepicker>[1]);
    if (this.value) this.applyToPicker(this.value);
  }

  ngOnDestroy(): void {
    this.picker?.destroy();
  }

  /** Live typing: mask to dd/mm/yyyy and derive the ISO model (or '' if not yet valid). */
  onType(): void {
    const el = this.field().nativeElement;
    const masked = maskDate(el.value);
    if (masked !== el.value) el.value = masked;
    this.raw = masked;
    this.value = displayToIso(masked) ?? '';
    this.onChange(this.value);
    this.onValidatorChange();
  }

  /** Calendar selection: changeDate fires on pick AND on clear (undefined date). */
  onPicked(): void {
    // flowbite's ambient typings say string, but the runtime returns a Date
    const picked: unknown = this.picker?.getDate();
    this.value =
      picked instanceof Date
        ? `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`
        : '';
    this.raw = this.value ? isoToDisplay(this.value) : '';
    this.field().nativeElement.value = this.raw;
    this.onChange(this.value);
    this.onValidatorChange();
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    const text = this.raw.trim();
    if (!text) return null; // emptiness is `required`'s job
    const iso = displayToIso(text);
    if (!iso) return { dateInvalid: true };
    const max = this.max();
    if (max && iso > max) return { dateMax: true };
    return null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
    this.raw = this.value ? isoToDisplay(this.value) : '';
    const el = this.field()?.nativeElement;
    if (el) el.value = this.raw;
    if (this.picker) this.applyToPicker(this.value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.field().nativeElement.disabled = isDisabled;
  }

  private applyToPicker(iso: string): void {
    // flowbite's ambient typings narrow setDate to string; runtime accepts
    // Date objects and {clear} option objects (vanillajs-datepicker API)
    const picker = this.picker as unknown as { setDate: (arg: unknown) => void };
    if (iso) {
      picker.setDate(new Date(`${iso}T00:00:00`));
    } else {
      picker.setDate({ clear: true });
    }
  }
}
