import { Component, inject } from '@angular/core';
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
  | 'clipboard';

interface NavItem {
  label: string;
  route: string | null; // null = module not implemented yet
  icon: NavIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './main-layout.html',
})
export class MainLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentAdmin = this.auth.currentAdmin;

  /** Admin modules per the closed v7 scope; routes activate as features land. */
  readonly navGroups: NavGroup[] = [
    {
      title: 'Operación',
      items: [
        { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
        { label: 'Afiliados', route: '/drivers', icon: 'users' },
        { label: 'Membresía', route: '/membership', icon: 'badge' },
        { label: 'Tarifas', route: '/subscription-plans', icon: 'cash' },
        { label: 'Requerimientos', route: '/requirements', icon: 'clipboard' },
        { label: 'Documentos', route: null, icon: 'document' },
        { label: 'Beneficios', route: '/benefits', icon: 'gift' },
        { label: 'Capacitaciones', route: null, icon: 'academic' },
        { label: 'Auditoría', route: '/audit', icon: 'shield' },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { label: 'Tipos de vehículo', route: '/vehicle-types', icon: 'truck' },
        { label: 'Administradores', route: '/admins', icon: 'user-circle' },
      ],
    },
  ];

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
