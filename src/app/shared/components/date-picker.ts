import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Datepicker } from 'flowbite-datepicker';

/** Pads to two digits for the ISO conversion. */
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Brand date picker built on the Flowbite datepicker (replaces the native
 * date input, whose calendar popup cannot be styled). ControlValueAccessor:
 * the model travels as ISO `yyyy-MM-dd` (the API format) or '' when empty,
 * while the field displays `dd/mm/yyyy`. The popup uses Flowbite semantic
 * tokens, so it renders in the EDV palette on both themes automatically.
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
        autocomplete="off"
        [id]="inputId()"
        [attr.name]="name() || null"
        [placeholder]="placeholder()"
        (changeDate)="onPicked()"
        (blur)="onTouched()"
        class="block h-[42px] w-full rounded-lg border border-gray-300 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 focus:border-primary-700 focus:ring-primary-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
      />
    </div>
  `,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePicker), multi: true },
  ],
})
export class DatePicker implements ControlValueAccessor, AfterViewInit, OnDestroy {
  readonly inputId = input('');
  readonly name = input('');
  readonly placeholder = input('dd/mm/aaaa');
  /** Upper bound as ISO yyyy-MM-dd (e.g. adulthood limit for birth dates). */
  readonly max = input<string | null>(null);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private picker: Datepicker | null = null;
  /** ISO value ('' = empty), pending until the picker exists. */
  private value = '';

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  ngAfterViewInit(): void {
    const max = this.max();
    this.picker = new Datepicker(this.field().nativeElement, {
      format: 'dd/mm/yyyy',
      autohide: true,
      todayHighlight: true,
      // Anchor below the field so it doesn't float to the top inside modals
      orientation: 'bottom left',
      ...(max ? { maxDate: new Date(`${max}T00:00:00`) } : {}),
    });
    if (this.value) this.applyToPicker(this.value);
  }

  ngOnDestroy(): void {
    this.picker?.destroy();
  }

  /** changeDate fires on selection AND on clear (undefined date). */
  onPicked(): void {
    // flowbite's ambient typings say string, but the runtime returns a Date
    const picked: unknown = this.picker?.getDate();
    this.value =
      picked instanceof Date
        ? `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`
        : '';
    this.onChange(this.value);
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
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
