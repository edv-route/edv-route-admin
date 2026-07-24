export type PaymentMethodType =
  | 'bank_transfer'
  | 'pago_movil'
  | 'zelle'
  | 'paypal'
  | 'binance'
  | 'crypto'
  | 'contact';

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
  paypal: 'PayPal',
  binance: 'Binance Pay',
  crypto: 'USDT — Wallet TRC20',
  contact: 'Contactar al administrador',
};

export interface PaymentMethodField {
  key: string;
  label: string;
  required: boolean;
  /** 'select' renders a branded dropdown with `options`; default is a text input. */
  control?: 'text' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
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
export const PAYMENT_METHOD_FIELDS: Record<PaymentMethodType, PaymentMethodField[]> = {
  bank_transfer: [
    { key: 'bank', label: 'Banco', required: true, control: 'select', options: VENEZUELAN_BANKS },
    { key: 'accountNumber', label: 'Número de cuenta', required: true },
    {
      key: 'accountType', label: 'Tipo de cuenta', required: true, control: 'select',
      options: [
        { value: 'ahorro', label: 'Ahorro' },
        { value: 'corriente', label: 'Corriente' },
      ],
    },
    { key: 'accountHolder', label: 'Titular', required: true },
    { key: 'idDocument', label: 'Cédula / RIF', required: true, placeholder: 'V-12345678' },
  ],
  pago_movil: [
    { key: 'bank', label: 'Banco', required: true, control: 'select', options: VENEZUELAN_BANKS },
    { key: 'phone', label: 'Teléfono', required: true, placeholder: '0412-1234567' },
    { key: 'idDocument', label: 'Cédula / RIF', required: true, placeholder: 'V-12345678' },
  ],
  zelle: [
    { key: 'email', label: 'Email o teléfono', required: true },
    { key: 'holder', label: 'Titular', required: false },
  ],
  paypal: [{ key: 'email', label: 'Email', required: true }],
  binance: [{ key: 'identifier', label: 'Email o Pay ID', required: true }],
  crypto: [
    { key: 'walletAddress', label: 'Dirección de wallet (TRC20)', required: true, placeholder: 'TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
  ],
  contact: [
    { key: 'phone', label: 'Teléfono / WhatsApp', required: true, placeholder: '0412-1234567' },
    { key: 'contactMethod', label: 'Método de contacto', required: false, placeholder: 'ej. WhatsApp' },
  ],
};
