import {
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/** One row in the action menu. `key` is echoed back through the (select) output. */
export interface ActionMenuItem {
  key: string;
  label: string;
  /** Optional leading icon: an SVG path 'd' (heroicons outline). */
  iconPath?: string;
  /** Renders the row in the destructive (red) style. */
  danger?: boolean;
}

/**
 * Kebab (⋮) menu for container-level actions. Gives a card its own affordance so
 * its actions stop blending with the inline actions of the items it holds
 * (e.g. a vehicle card vs. its document rows). Closes on outside click and
 * Escape, mirroring <app-select>.
 */
@Component({
  selector: 'app-action-menu',
  templateUrl: './action-menu.html',
  host: { class: 'relative inline-block' },
})
export class ActionMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input.required<ActionMenuItem[]>();
  readonly ariaLabel = input('Acciones');

  readonly isOpen = signal(false);
  readonly select = output<string>();

  toggle(): void {
    this.isOpen.update((open) => !open);
  }

  run(item: ActionMenuItem): void {
    this.select.emit(item.key);
    this.isOpen.set(false);
  }

  /** Closing on outside click is what users expect from a menu. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }
}
