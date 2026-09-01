import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/main-layout/main-layout').then((m) => m.MainLayout),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'drivers',
        loadComponent: () => import('./features/drivers/drivers').then((m) => m.Drivers),
      },
      {
        path: 'drivers/new',
        loadComponent: () =>
          import('./features/drivers/driver-wizard').then((m) => m.DriverWizard),
      },
      {
        path: 'drivers/:id',
        loadComponent: () =>
          import('./features/drivers/driver-detail').then((m) => m.DriverDetail),
      },
      {
        path: 'drivers/:id/payments',
        loadComponent: () =>
          import('./features/drivers/driver-payments').then((m) => m.DriverPayments),
      },
      {
        path: 'clients',
        loadComponent: () => import('./features/clients/clients').then((m) => m.Clients),
      },
      {
        path: 'locations',
        loadComponent: () => import('./features/locations/locations').then((m) => m.Locations),
      },
      {
        path: 'locations/:id',
        loadComponent: () =>
          import('./features/locations/driver-trail').then((m) => m.DriverTrail),
      },
      {
        path: 'drivers/:id/vehicles/:vehicleId',
        loadComponent: () =>
          import('./features/drivers/driver-vehicle-detail').then((m) => m.DriverVehicleDetail),
      },
      {
        path: 'requests',
        loadComponent: () => import('./features/requests/requests').then((m) => m.Requests),
      },
      {
        path: 'requests/:id',
        loadComponent: () =>
          import('./features/requests/request-detail').then((m) => m.RequestDetail),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'vehicle-types',
        loadComponent: () =>
          import('./features/vehicle-types/vehicle-types').then((m) => m.VehicleTypes),
      },
      {
        path: 'admins',
        loadComponent: () => import('./features/admins/admins').then((m) => m.Admins),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
      {
        path: 'requirements',
        loadComponent: () =>
          import('./features/requirements/requirements').then((m) => m.Requirements),
      },
      {
        path: 'membership',
        loadComponent: () =>
          import('./features/membership/membership').then((m) => m.MembershipPage),
      },
      {
        path: 'membership/edit',
        loadComponent: () =>
          import('./features/membership/membership-editor').then((m) => m.MembershipEditor),
      },
      {
        path: 'billing',
        loadComponent: () => import('./features/billing/billing').then((m) => m.Billing),
      },
      {
        path: 'receipts',
        loadComponent: () => import('./features/receipts/receipts').then((m) => m.Receipts),
      },
      {
        path: 'billing/submissions/:id',
        loadComponent: () =>
          import('./features/billing/payment-submission-detail').then(
            (m) => m.PaymentSubmissionDetail,
          ),
      },
      {
        path: 'billing/:id',
        loadComponent: () =>
          import('./features/billing/billing-invoice-detail').then((m) => m.BillingInvoiceDetail),
      },
      {
        path: 'documents',
        loadComponent: () => import('./features/documents/documents').then((m) => m.Documents),
      },
      {
        path: 'trainings',
        loadComponent: () => import('./features/trainings/trainings').then((m) => m.Trainings),
      },
      {
        path: 'subscription-plans',
        loadComponent: () =>
          import('./features/subscription-plans/subscription-plans').then(
            (m) => m.SubscriptionPlans,
          ),
      },
      {
        path: 'payment-methods',
        loadComponent: () =>
          import('./features/payment-methods/payment-methods').then((m) => m.PaymentMethods),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
