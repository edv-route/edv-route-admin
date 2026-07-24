import { Component, inject, signal } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PasswordInput } from '../../../shared/components/password-input';

@Component({
  selector: 'app-login',
  imports: [FormsModule, PasswordInput],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  onSubmit(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);

    this.auth.login(this.username, this.password).subscribe({
      next: () => void this.router.navigate(['/']),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          (err.error as { message?: string } | null)?.message ??
            'No se pudo conectar con el servidor. Verifica que la API esté corriendo.',
        );
      },
    });
  }
}
