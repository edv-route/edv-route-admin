import { Component, computed, input, signal } from '@angular/core';

/** Tailwind sizing per variant, so callers pick a size instead of pasting classes. */
const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Affiliate avatar: the profile photo when there is one, initials otherwise.
 * Stateless (shared) and used everywhere a person is listed, so the fallback
 * lives in ONE place — every list showed hand-rolled initials before.
 *
 * The photo arrives as a SIGNED URL that expires (the bucket is private): if it
 * has expired or the object is gone, the `error` path silently falls back to
 * initials rather than leaving a broken image in the table.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <span
      class="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 font-bold text-primary-700 dark:bg-gray-700 dark:text-gold-400"
      [class]="sizeClasses()"
    >
      @if (photoUrl() && !failed()) {
        <img
          [src]="photoUrl()"
          [alt]="fullName()"
          class="h-full w-full object-cover"
          (error)="failed.set(true)"
        />
      } @else {
        {{ initials() }}
      }
    </span>
  `,
})
export class Avatar {
  /** Signed URL of the profile photo; null/absent falls back to initials. */
  readonly photoUrl = input<string | null>(null);
  readonly fullName = input('');
  readonly size = input<AvatarSize>('sm');

  /** A photo that fails to load (expired signature) degrades to initials. */
  protected readonly failed = signal(false);

  protected readonly sizeClasses = computed(() => SIZES[this.size()]);

  /** First letter of the first two words: "Luis Vera" -> "LV". */
  protected readonly initials = computed(() => {
    const parts = this.fullName().trim().split(/s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  });
}
