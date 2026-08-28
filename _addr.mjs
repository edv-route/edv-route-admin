import fs from 'node:fs';

// ---- locations.ts: pedir la calle al seleccionar un afiliado ----
{
  const f = 'src/app/features/locations/locations.ts';
  const raw = fs.readFileSync(f, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const at = (pred, from = 0) => {
    for (let i = from; i < lines.length; i++) if (pred(lines[i])) return i;
    throw new Error('no encontrado en locations.ts: ' + pred.toString().slice(0, 60));
  };

  // Señal con la calle del seleccionado.
  const mpIdx = at((l) => l.includes('readonly mapProblem = signal'));
  lines.splice(
    mpIdx + 1,
    0,
    '',
    '  /** Street name of the selected affiliate, resolved on demand. */',
    '  readonly address = signal<string | null>(null);',
    '  readonly addressLoading = signal(false);',
  );

  // Al seleccionar, resolver la calle.
  const selIdx = at((l) => l.includes('select(userId: string): void {'));
  const closeIdx = at((l) => l.trim() === '}', selIdx);
  lines.splice(
    closeIdx + 1,
    0,
    '',
    '  /**',
    '   * Resolves the street for whoever is selected. Asked here and not while',
    '   * drawing the map because the geocoder allows one request per second.',
    '   */',
    '  private resolveAddress(): void {',
    '    const item = this.selected();',
    '    this.address.set(null);',
    '    if (!item) return;',
    '    this.addressLoading.set(true);',
    '    const asked = item.userId;',
    '    this.api.address(item.lat, item.lon).subscribe({',
    '      next: ({ label }) => {',
    '        if (this.selectedId() !== asked) return; // ya se mira a otro',
    '        this.address.set(label);',
    '        this.addressLoading.set(false);',
    '      },',
    '      // A card without a street is fine; a card that breaks is not.',
    '      error: () => this.addressLoading.set(false),',
    '    });',
    '  }',
  );

  // Disparar la resolucion cuando cambia la seleccion.
  const selBody = at((l) => l.includes('this.selectedId.update((current) =>'));
  lines.splice(selBody + 1, 0, '    this.resolveAddress();');

  fs.writeFileSync(f, lines.join(eol));
  console.log('ok locations.ts');
}

// ---- locations.html: mostrarla en la ficha ----
{
  const f = 'src/app/features/locations/locations.html';
  let s = fs.readFileSync(f, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const anchor = [
    '            <div class="flex items-center justify-between">',
    '              <dt class="text-gray-500 dark:text-gray-400">Última posición</dt>',
  ].join(eol);
  if (!s.includes(anchor)) throw new Error('no anchor en locations.html');

  const bloque = [
    '            <div class="flex items-start justify-between gap-3">',
    '              <dt class="shrink-0 text-gray-500 dark:text-gray-400">Dónde</dt>',
    '              <dd class="text-right font-semibold text-gray-900 dark:text-white">',
    '                @if (addressLoading()) {',
    '                  <span class="text-gray-400">buscando…</span>',
    '                } @else if (address(); as calle) {',
    '                  {{ calle }}',
    '                } @else {',
    '                  <span class="text-gray-400">Sin calle conocida</span>',
    '                }',
    '              </dd>',
    '            </div>',
  ].join(eol);

  s = s.replace(anchor, () => bloque + eol + anchor);
  fs.writeFileSync(f, s);
  console.log('ok locations.html');
}
