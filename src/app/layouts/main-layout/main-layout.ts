import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type NavIcon =
  | 'dashboard'
  | 'users'
  | 'badge'
  | 'cash'
  | 'document'
  | 'gift'
  | 'academic'
  | 'shield'
  | 'truck'
  | 'user-circle'
  | 'clipboard'
  | 'receipt'
  | 'cog';

interface NavItem {
  label: string;
  route: string | null; // null = module not implemented yet
  icon: NavIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const THEME_KEY = 'edv_theme';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './main-layout.html',
})
export class MainLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentAdmin = this.auth.currentAdmin;

  /** Dark mode toggle (Pro navbar pattern; class-based via `.dark` on <html>). */
  readonly isDark = signal(this.readInitialTheme());

  /** Initials for the avatar chip in the account menu. */
  readonly adminInitials = computed(() => {
    const admin = this.currentAdmin();
    if (!admin?.fullName) return '?';
    const parts = admin.fullName.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  });

  /** Admin modules per the closed v7 scope; routes activate as features land. */
  readonly navGroups: NavGroup[] = [
    {
      title: 'Operación',
      items: [
        { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
        { label: 'Afiliados', route: '/drivers', icon: 'users' },
        { label: 'Membresía', route: '/membership', icon: 'badge' },
        { label: 'Tarifas', route: '/subscription-plans', icon: 'cash' },
        { label: 'Facturación', route: '/billing', icon: 'receipt' },
        { label: 'Métodos de pago', route: '/payment-methods', icon: 'cash' },
        { label: 'Requerimientos', route: '/requirements', icon: 'clipboard' },
        { label: 'Documentos', route: '/documents', icon: 'document' },
        { label: 'Capacitaciones', route: '/trainings', icon: 'academic' },
        { label: 'Auditoría', route: '/audit', icon: 'shield' },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { label: 'Tipos de vehículo', route: '/vehicle-types', icon: 'truck' },
        { label: 'Administradores', route: '/admins', icon: 'user-circle' },
        { label: 'Configuración', route: '/settings', icon: 'cog' },
      ],
    },
  ];

  constructor() {
    this.applyTheme(this.isDark());
  }

  toggleTheme(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    this.applyTheme(next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }

  /** Light by default: dark mode is explicit (no OS-preference surprises). */
  private readInitialTheme(): boolean {
    return localStorage.getItem(THEME_KEY) === 'dark';
  }

  private applyTheme(dark: boolean): void {
    document.documentElement.classList.toggle('dark', dark);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
