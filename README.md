# EDV Route — Admin

Panel de administración de EDV Route (Profesionales del Volante).

## Stack

- **Angular 22** (standalone components, zoneless, signals)
- **Tailwind CSS 4** + **Flowbite** (componentes UI)
- **Montserrat** autohospedada (tipografía oficial de marca)

## Estructura de carpetas

```
src/app/
├── core/           # Singletons de aplicación (se cargan una sola vez)
│   ├── guards/     #   Route guards (auth, roles)
│   ├── interceptors/ # HTTP interceptors (token, errores)
│   ├── models/     #   Interfaces/tipos del dominio
│   └── services/   #   Servicios singleton (API, auth, websocket)
├── shared/         # Reutilizable y sin estado (importable desde cualquier feature)
│   ├── components/ #   Componentes UI (botones, tablas, modales...)
│   ├── directives/ #   Directivas
│   └── pipes/      #   Pipes
├── features/       # Módulos de dominio, lazy-loaded por ruta
└── layouts/        # Shells de página (main layout, auth layout)

public/assets/      # Assets estáticos servidos tal cual
├── logos/          # Logos EDV en SVG (horizontal/vertical/cuadrado × color)
├── icons/          # Favicons
├── images/         # Portadas / fondos
└── fonts/          # Montserrat (TTF) + licencia
```

**Reglas:**

- `core` nunca importa desde `features`.
- `shared` no tiene estado ni servicios; solo UI reutilizable.
- Cada feature se registra en `app.routes.ts` con `loadChildren`/`loadComponent` (lazy).
- Ningún archivo fuente supera las 1000 líneas.

## Tema de marca

Definido en `src/styles.css` (`@theme` de Tailwind v4):

| Token | Valor | Origen |
|---|---|---|
| `primary-700` | `#920606` | Color 2 oficial (rojo) |
| `primary-900` | `#661212` | Color 3 oficial (vinotinto) |
| `gold-400` | `#EBCA54` | Color 1 oficial (dorado) |
| `bg-brand-gradient` | rojo → negro | Degradado oficial |

`primary` sigue la convención de Flowbite, por lo que sus componentes lo adoptan automáticamente.
El kit de marca completo (todas las variantes, PDFs, fuentes) vive en `../docs/brand/`.

## Comandos

```bash
npm start        # dev server en http://localhost:4200
npm run build    # build de producción (dist/)
npm test         # unit tests (Vitest)
```
