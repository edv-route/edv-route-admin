import {
  Component,
  ElementRef,
  HostListener,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

export interface SelectOption {
  value: string | number;
  label: string;
  /** Optional leading glyph shown before the label (flag, initial…). */
  prefix?: string;
}

/**
 * Branded select: a native <select> only lets CSS style its closed state -
 * the arrow and the dropdown panel are drawn by the OS and cannot follow the
 * EDV theme. This one owns both states, works with [(ngModel)] through
 * ControlValueAccessor and keeps native keyboard/ARIA semantics.
 */
@Component({
  selector: 'app-select',
  templateUrl: './select.html',
  host: { class: 'relative block' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true },
  ],
})
export class Select implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<SelectOption[]>();
  readonly placeholder = input('Seleccionar…');
  readonly ariaLabel = input('');
  /** Compact variant for inline groups (national id type, country code). */
  readonly compact = input(false);

  readonly value = signal<string | number | null>(null);
  readonly isOpen = signal(false);
  readonly disabled = signal(false);
  /** Keyboard highlight; -1 = none. */
  readonly activeIndex = signal(-1);

  readonly selected = computed(
    () => this.options().find((option) => option.value === this.value()) ?? null,
  );

  private onChange: (value: string | number | null) => void = () => {};
  private onTouched: () => void = () => {};

  // --- ControlValueAccessor ---

  writeValue(value: string | number | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) this.isOpen.set(false);
  }

  // --- interaction ---

  toggle(): void {
    if (this.disabled()) return;
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.activeIndex.set(this.options().findIndex((o) => o.value === this.value()));
    this.isOpen.set(true);
  }

  select(option: SelectOption): void {
    this.value.set(option.value);
    this.onChange(option.value);
    this.close();
  }

  close(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.onTouched(); // marks ng-touched: validation styles may kick in
  }

  /** Closing on outside click is what users expect from a dropdown. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const options = this.options();

    switch (event.key) {
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.close();
        }
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.isOpen()) {
          this.toggle();
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = this.activeIndex() + step;
        this.activeIndex.set(
          next < 0 ? options.length - 1 : next >= options.length ? 0 : next,
        );
        return;
      }
      case 'Home':
      case 'End':
        if (this.isOpen()) {
          event.preventDefault();
          this.activeIndex.set(event.key === 'Home' ? 0 : options.length - 1);
        }
        return;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const active = options[this.activeIndex()];
        if (this.isOpen() && active) {
          this.select(active);
        } else {
          this.toggle();
        }
        return;
      }
      case 'Tab':
        if (this.isOpen()) this.close();
        return;
      default:
        return;
    }
  }
}
