import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Admin, LoginResponse } from '../models/admin.model';

const TOKEN_KEY = 'edv_admin_token';
const ADMIN_KEY = 'edv_admin_user';

function readStoredAdmin(): Admin | null {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_KEY) ?? 'null') as Admin | null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly tokenSignal = signal<string | null>(sessionStorage.getItem(TOKEN_KEY));
  private readonly adminSignal = signal<Admin | null>(readStoredAdmin());

  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);
  readonly currentAdmin = this.adminSignal.asReadonly();

  get token(): string | null {
    return this.tokenSignal();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password })
      .pipe(
        tap(({ token, admin }) => {
          sessionStorage.setItem(TOKEN_KEY, token);
          sessionStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
          this.tokenSignal.set(token);
          this.adminSignal.set(admin);
        }),
      );
  }

  logout(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_KEY);
    this.tokenSignal.set(null);
    this.adminSignal.set(null);
  }
}
