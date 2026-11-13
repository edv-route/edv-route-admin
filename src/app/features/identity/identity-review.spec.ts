import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { NgForm } from '@angular/forms';
import { environment } from '../../../environments/environment';
import type { IdentityView } from '../../core/models/identity.model';
import { IdentityReview } from './identity-review';

const base = `${environment.apiUrl}/identity`;

const view = (overrides: Partial<IdentityView> = {}): IdentityView => ({
  status: 'pending',
  required: false,
  photos: [
    { id: 'p1', kind: 'selfie', status: 'pending', rejectionReason: null, uploadedAt: '2026-11-12T10:42:00Z', reviewedAt: null, url: 'u1' },
    { id: 'p2', kind: 'id_front', status: 'approved', rejectionReason: null, uploadedAt: '2026-11-12T10:43:00Z', reviewedAt: null, url: 'u2' },
  ],
  ...overrides,
});

/** A form double: only `invalid` and `markAllAsTouched` are read. */
const form = (invalid: boolean) =>
  ({ invalid, control: { markAllAsTouched: () => undefined } }) as unknown as NgForm;

describe('IdentityReview', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IdentityReview],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(IdentityReview);
    fixture.componentRef.setInput('userId', 'u-1');
    fixture.detectChanges();
    http.expectOne(`${base}/users/u-1`).flush(view());
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads the photos and indexes them by kind', () => {
    const c = create();
    expect(c.byKind().get('selfie')?.id).toBe('p1');
    expect(c.byKind().has('id_back')).toBe(false);
    expect(c.pendingCount()).toBe(1);
  });

  it('a rejection without a reason never reaches the API', () => {
    const c = create();
    c.openReject(c.byKind().get('selfie')!);
    c.confirmReject(form(true));
    expect(c.rejectError()).toBe('Elige el motivo del rechazo.');
    http.expectNone(`${base}/photos/p1/reject`);
  });

  it('"Otro motivo" sends the written reason, not the label', () => {
    const c = create();
    c.openReject(c.byKind().get('selfie')!);
    c.reasonChoice = c.other;
    c.otherReason = '  Se ve otra persona  ';
    c.confirmReject(form(false));
    const req = http.expectOne(`${base}/photos/p1/reject`);
    expect(req.request.body).toEqual({ reason: 'Se ve otra persona' });
    req.flush(view({ status: 'rejected' }));
    expect(c.rejecting()).toBeNull();
    expect(c.view()?.status).toBe('rejected');
  });

  it('approving reports the new verdict to the host', () => {
    const c = create();
    let reported: IdentityView | null = null;
    c.loaded.subscribe((v) => (reported = v));
    c.approve(c.byKind().get('selfie')!);
    http.expectOne(`${base}/photos/p1/approve`).flush(view({ status: 'approved' }));
    expect(reported!.status).toBe('approved');
    expect(c.busyPhotoId()).toBeNull();
  });
});
