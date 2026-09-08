export function normalizeWhatsAppRecipient(value: string) {
  const digits = value.replace(/\D/g, '');

  // Algunos webhooks de WhatsApp todavía entregan números mexicanos
  // con el prefijo histórico 521. Cloud API espera E.164 actual 52.
  if (/^521\d{10}$/.test(digits)) {
    return `52${digits.slice(3)}`;
  }

  return digits;
}

export function buildWhatsAppLink(phone: string, message: string) {
  const normalized = normalizeWhatsAppRecipient(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
