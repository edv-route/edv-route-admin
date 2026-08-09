import { Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

const SPINNER_CLASSES = [
  'mr-2',
  'h-4',
  'w-4',
  'shrink-0',
  'animate-spin',
  'rounded-full',
  'border-2',
  'border-current',
  'border-t-transparent',
];

/**
 * Inline loading spinner for action buttons. While `appBusy` is true it prepends a
 * single, panel-wide spinner inside the host (making it a flex row so the spinner
 * sits before the label) and removes it when false. It does NOT toggle `disabled`
 * — keep the element's own `[disabled]` binding (buttons often have extra
 * conditions). The label text (e.g. `{{ saving() ? 'Guardando…' : 'Guardar' }}`)
 * stays where it is. One spinner style for every button.
 *
 * Use on a host with a STATIC `class` (not a `[class]` binding, which would wipe
 * the added flex classes on re-render).
 */
@Directive({ selector: '[appBusy]' })
export class BusyDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  readonly appBusy = input.required<boolean>();

  private spinner: HTMLElement | null = null;

  constructor() {
    const el = this.host.nativeElement;
    this.renderer.addClass(el, 'inline-flex');
    this.renderer.addClass(el, 'items-center');
    this.renderer.addClass(el, 'justify-center');
    effect(() => (this.appBusy() ? this.show() : this.hide()));
  }

  private show(): void {
    if (this.spinner) return;
    const s = this.renderer.createElement('span') as HTMLElement;
    for (const c of SPINNER_CLASSES) this.renderer.addClass(s, c);
    this.renderer.setAttribute(s, 'aria-hidden', 'true');
    this.renderer.insertBefore(this.host.nativeElement, s, this.host.nativeElement.firstChild);
    this.spinner = s;
  }

  private hide(): void {
    if (!this.spinner) return;
    this.renderer.removeChild(this.host.nativeElement, this.spinner);
    this.spinner = null;
  }
}
