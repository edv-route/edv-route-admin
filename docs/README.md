# EDV Route — Panel admin (`edv-route-admin`)

Documento de contexto del proyecto **admin** para retomar en una sesión nueva. La doc
detallada (API, esquema, decisiones) vive con el backend en
[`edv-route-backend/docs/`](../../edv-route-backend/docs/README.md); aquí queda el mapa del panel.

## Qué es

Panel de administración web del sistema **EDV Route** (gestión de choferes "Profesionales del
Volante": membresía, tarifas/planes, documentos, vehículos, **facturación y pagos**, capacitaciones).
Consume el backend `edv-route-backend` (Fastify) por HTTP — **nunca toca la BD directo**.

## Stack

- **Angular 22** — standalone components, signals, control flow (`@if`/`@for`), rutas **lazy**.
- **Tailwind 4 + Flowbite**. La UI se copia de la versión **Flowbite Pro** (licencia comprada) en
  `C:\Project\edv\flowbite-admin-dashboard-v2.2.0`, no de la gratis.
- Tipografía **Montserrat**; paleta de marca (primary `#920606`, gold `#EBCA54`).

## Arquitectura (reglas — ver también `C:\Project\edv\CLAUDE.md`)

- `core/` — guards (`authGuard`), modelos, servicios base. **No importa de `features`.**
- `features/` — una carpeta por feature, **lazy-loaded**. API por feature en `*.api.ts` (HttpClient).
- `shared/` — componentes **sin estado**: `select` (usar siempre en vez de `<select>` a pelo),
  `date-picker`, `password-input`, `file-viewer`, **`action-menu`** (kebab ⋮ de acciones de
  contenedor), **`pagination`** (paginado numerado Flowbite Pro para listas server-side;
  inputs `page`/`total`/`pageSize`, output `pageChange`), directivas de `input-filters`
  (`appLetters/appDigits/appAlnum/appAlnumDash`) y **`appBusy`** (spinner interno del botón
  mientras `[appBusy]` es `true`; no toca el `[disabled]`; un único estilo de spinner en todo el panel).
- **Textos de UI en español; código y comentarios en inglés.**
- **Formularios**: Angular pone `novalidate`, así que todo form usa `#f="ngForm"` +
  `markAllAsTouched()` al enviar (CSS global pinta `.ng-invalid.ng-touched`) y muestra el error
  **junto al botón**, no arriba.
- Límite duro **1000 líneas/archivo**.

## Features (rutas — `src/app/app.routes.ts`)

| Ruta | Feature | Qué hace |
|---|---|---|
| `/login` | `auth/login` | Login admin (usuario + contraseña) |
| `/dashboard` | `dashboard` | Métricas y resumen |
| `/drivers` · `/drivers/new` · `/drivers/:id` | `drivers` | Lista · **wizard de alta (4 pasos)** · perfil del chofer |
| `/drivers/:id/payments` · `/drivers/:id/vehicles/:vehicleId` | `drivers` | Historial de pagos (1 fila/recibo) · detalle de vehículo |
| `/billing` · `/billing/:id` | `billing` | **Facturación**: solo facturas (gráfico mensual + filtro de estado + búsqueda) · detalle de factura |
| `/receipts` · `/billing/submissions/:id` | `receipts` | **Recibos de pagos**: pestañas Pagos/Por aprobar · detalle de recibo (compartido, vuelve con `location.back()`) |
| `/membership` | `membership` | Membresía + catálogo de **beneficios** (hijo, no sección propia) |
| `/subscription-plans` | `subscription-plans` | Planes/tarifas |
| `/payment-methods` | `payment-methods` | Catálogo de métodos de pago |
| `/requirements` | `requirements` | Requisitos de documentos (por origen) |
| `/documents` | `documents` | Documentos |
| `/vehicle-types` | `vehicle-types` | Tipos de vehículo |
| `/trainings` | `trainings` | Capacitaciones |
| `/admins` · `/settings` | `admins`/`settings` | Admins · Ajustes |

Piezas clave de `drivers/`: `driver-wizard` (alta), `person-form`, `vehicle-form`,
`vehicle-draft-modal`, `document-draft-modal`, `payment-draft-modal` + `payment-capture` (captura de
pago **inline**, referencia de diseño para la app móvil), `driver-detail`, `driver-payments`.

## Estado reciente

- **Rediseño de facturación (factura vs recibo) — PUSHEADO a prod 2026-08-05** (admin `99125a2`+`2a61b60`;
  backend `dfdc2ec`; Railway auto-deploy). 1 recibo de pago cubre N facturas (1 por concepto). ⚠️ **Se
  pusheó sin prueba end-to-end**: falta smoke test en prod (pago parcial · reversión refund/correction ·
  numeración continua · rechazo limpio).
- Componente compartido **`action-menu`** (kebab ⋮) para acciones de contenedor (vehículo en el wizard).
- **Gate del paso 1** del wizard (`environment.unlockSteps=false`): no se avanza sin completar Datos.

## Despliegue

- **Railway**: frontend (Docker/Caddy) + backend (Nixpacks), mismo Supabase que dev. **Push a `main` →
  auto-deploy.** Repos: admin `https://github.com/edv-route/edv-route-admin.git` (main), backend
  `https://github.com/edv-route/edv-route-backend.git` (main).
- Environments: `environment.prod.ts` → backend de Railway; `environment.ts` (dev) → `localhost:3000`.

## Cómo correr

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm start` | admin | Panel en `:4200` (dev apunta a `localhost:3000`) |
| `npm run build` | admin | Build de producción |
| `npm run dev` | backend | API en `:3000` (recarga) |

## Documentación relacionada

- Backend (API, esquema, decisiones): [`edv-route-backend/docs/README.md`](../../edv-route-backend/docs/README.md)
  · `api/endpoints.md` · `database/schema.md` · `decisions/decisions-log.md` · `database/database-design-v7.md`
  · `architecture/overview.md`.
- Reglas del monorepo: `C:\Project\edv\CLAUDE.md`.
- Kit de marca: [`docs/brand/`](brand/).

## Pendientes conocidos

- **Smoke test en prod** del rediseño de facturación (parcial · reversión · numeración · rechazo).
- Limpieza menor: `paySummary` computed sin uso en `driver-detail.ts`; rama `orphans` de `settleDebt` como
  defensa.
- (La **app móvil** `edv-route-mobile` es proyecto aparte; su paso 4 de pago debe replicar el `payment-capture`
  de este admin — ver `edv-route-mobile/docs/HANDOFF-2026-08-04.md`.)
