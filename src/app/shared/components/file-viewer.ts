import { Component, computed, HostListener, inject, input, output } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

/**
 * State the host resolves and hands to the viewer. The host owns the async work
 * (fetching the short-lived signed URL with its own API); the component only
 * presents the result. `null` = the viewer is closed.
 */
export interface FileViewerState {
  /** Modal title (e.g. the requirement name or "Comprobante de pago"). */
  title: string;
  /** Signed URL of the file; null while loading or after an error. */
  url: string | null;
  /** True while the host resolves the signed URL. */
  loading: boolean;
  /** Message shown instead of the file when the URL could not be resolved. */
  error: string | null;
}

/**
 * Branded modal viewer for a private file (PDF or image). The host resolves the
 * short-lived signed URL with its own API and passes it as `state`; this
 * component holds no domain state and makes no HTTP calls. PDFs render in an
 * <iframe>, images in an <img>; the type is inferred from the URL extension.
 * Closes on the X, the backdrop or Escape.
 */
@Component({
  selector: 'app-file-viewer',
  templateUrl: './file-viewer.html',
})
export class FileViewer {
  private readonly sanitizer = inject(DomSanitizer);

  readonly state = input<FileViewerState | null>(null);
  readonly close = output<void>();

  /** The file is a PDF (embedded in an iframe); otherwise it renders as an image. */
  readonly isPdf = computed(() => {
    const url = this.state()?.url;
    return !!url && url.split('?')[0].toLowerCase().endsWith('.pdf');
  });

  /** Sanitized URL for the <iframe> src (the signed URL comes from our backend). */
  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.state()?.url;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.state()) this.close.emit();
  }

  requestClose(): void {
    this.close.emit();
  }
}
