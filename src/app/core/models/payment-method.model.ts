/** Offered payment method types (decision 2026-07-31): only these 4. */
export type PaymentMethodType = 'bank_transfer' | 'pago_movil' | 'zelle' | 'binance';

export interface PaymentMethod {
  id: number;
  name: string;
  type: PaymentMethodType;
  /** Per-type payload (camelCase keys). See PAYMENT_METHOD_FIELDS. */
  details: Record<string, string>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PAYMENT_METHOD_TYPE_LABELS: Record<PaymentMethodType, string> = {
  bank_transfer: 'Transferencia bancaria',
  pago_movil: 'Pago Móvil',
  zelle: 'Zelle',
  binance: 'Binance Pay',
};

export interface PaymentMethodField {
  key: string;
  label: string;
  required: boolean;
  /**
   * How to render the field: `select` = branded dropdown with `options`;
   * `idDocument` = V/E/J type selector + digits (composed as "V-12345678", the
   * same canonical control the person form uses); default = a text input.
   */
  control?: 'text' | 'select' | 'idDocument';
  /** Live input filter for a text control: digits-only or letters-only. */
  filter?: 'digits' | 'letters';
  maxLength?: number;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /**
   * Format check (mirrors the backend FIELD_FORMATS): `email` = must be a valid
   * address; `emailOrText` = validate as email only when it contains '@' (the
   * field also accepts a phone/pay-id); `idDocument` = canonical V/E/J document.
   */
  validate?: 'email' | 'emailOrText' | 'idDocument';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_DOC_RE = /^[VEJ]-?\d{5,9}$/i;

/** Returns a Spanish error for a field value, or null when it is acceptable. */
export function paymentFieldError(field: PaymentMethodField, value: string): string | null {
  const v = value.trim();
  if (!v) return null; // emptiness is handled by the `required` check
  switch (field.validate) {
    case 'email':
      return EMAIL_RE.test(v) ? null : `${field.label}: correo no válido.`;
    case 'emailOrText':
      return v.includes('@') && !EMAIL_RE.test(v) ? `${field.label}: el correo no es válido.` : null;
    case 'idDocument':
      return ID_DOC_RE.test(v) ? null : `${field.label}: documento no válido (ej. V-12345678).`;
    default:
      return null;
  }
}

/**
 * National banks (Venezuela), code + name. The 4-digit prefix is the standard
 * Pago Móvil bank code. Stored as the readable "code - name" string so the card
 * shows it directly. If any is outdated, it's a one-line edit here.
 */
export const VENEZUELAN_BANKS: { value: string; label: string }[] = [
  '0102 - Banco de Venezuela',
  '0104 - Banco Venezolano de Crédito',
  '0105 - Banco Mercantil',
  '0108 - Banco Provincial (BBVA)',
  '0114 - Bancaribe',
  '0115 - Banco Exterior',
  '0128 - Banco Caroní',
  '0134 - Banesco',
  '0137 - Banco Sofitasa',
  '0138 - Banco Plaza',
  '0146 - Bangente',
  '0151 - Banco Fondo Común (BFC)',
  '0156 - 100% Banco',
  '0157 - DelSur',
  '0163 - Banco del Tesoro',
  '0166 - Banco Agrícola de Venezuela',
  '0168 - Bancrecer',
  '0169 - Mi Banco',
  '0171 - Banco Activo',
  '0172 - Bancamiga',
  '0173 - Banco Internacional de Desarrollo',
  '0174 - Banplus',
  '0175 - Banco Bicentenario',
  '0177 - Banfanb',
  '0178 - N58 Banco Digital',
  '0191 - Banco Nacional de Crédito (BNC)',
].map((bank) => ({ value: bank, label: bank }));

/**
 * Fields captured (and shown) per payment method type. Must mirror the backend
 * REQUIRED_DETAILS validation in payment-methods.service.ts.
 */
/**
 * Fields per method type — the data actually needed to RECEIVE with each one
 * (researched 2026-07-31). Must mirror the backend REQUIRED_DETAILS/FIELD_FORMATS.
 *  - Pago Móvil (VE): bank + phone + V/E/J document of the account holder.
 *  - Transferencia (VE): bank + 20-digit account + type + holder + document.
 *  - Zelle (US): the enrolled email OR US phone + the holder's name to verify.
 *  - Binance: email / phone / Binance ID (the old "Pay ID" was retired 2024).
 */
export const PAYMENT_METHOD_FIELDS: Record<PaymentMethodType, PaymentMethodField[]> = {
  bank_transfer: [
    { key: 'bank', label: 'Banco', required: true, control: 'select', options: VENEZUELAN_BANKS },
    { key: 'accountNumber', label: 'Número de cuenta (20 dígitos)', required: true, filter: 'digits', maxLength: 20, placeholder: '01020123456789012345' },
    {
      key: 'accountType', label: 'Tipo de cuenta', required: true, control: 'select',
      options: [
        { value: 'ahorro', label: 'Ahorro' },
        { value: 'corriente', label: 'Corriente' },
      ],
    },
    { key: 'accountHolder', label: 'Titular', required: true, placeholder: 'Nombre o razón social' },
    { key: 'idDocument', label: 'Cédula / RIF del titular', required: true, control: 'idDocument', validate: 'idDocument' },
  ],
  pago_movil: [
    { key: 'bank', label: 'Banco', required: true, control: 'select', options: VENEZUELAN_BANKS },
    { key: 'phone', label: 'Teléfono', required: true, filter: 'digits', maxLength: 11, placeholder: '04121234567' },
    { key: 'idDocument', label: 'Cédula / RIF', required: true, control: 'idDocument', validate: 'idDocument' },
  ],
  zelle: [
    { key: 'email', label: 'Email o teléfono (EE.UU.)', required: true, validate: 'emailOrText', placeholder: 'correo@ejemplo.com' },
    { key: 'holder', label: 'Titular', required: true, placeholder: 'Nombre del titular' },
  ],
  binance: [
    { key: 'identifier', label: 'Email, teléfono o Binance ID', required: true, validate: 'emailOrText', placeholder: 'correo@ejemplo.com o Binance ID' },
    { key: 'holder', label: 'Titular', required: false, placeholder: 'Nombre del titular' },
  ],
};
