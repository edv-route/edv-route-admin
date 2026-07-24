import { Component, forwardRef, input, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

/**
 * Password field with a show/hide toggle. Lives in shared because every
 * password in the panel (affiliate app access, admins, login) needs the same
 * behaviour: typing a password blind is where most typos come from.
 */
@Component({
  selector: 'app-password-input',
  templateUrl: './password-input.html',
  host: { class: 'block' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordInput), multi: true },
  ],
})
export class PasswordInput implements ControlValueAccessor {
  readonly inputId = input<string>('');
  readonly placeholder = input('');
  readonly autocomplete = input('new-password');

  readonly value = signal('');
  readonly visible = signal(false);
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }

  onBlur(): void {
    this.onTouched();
  }

  toggle(): void {
    this.visible.update((v) => !v);
  }
}
