// Sin dependencias: lo usan el remito (jsPDF) y pantallas livianas como el Dashboard.

/**
 * Normaliza un teléfono argentino al formato que espera wa.me: solo dígitos,
 * con código de país. Devuelve `null` si no parece un número usable — en ese
 * caso se abre WhatsApp sin destinatario y el usuario elige el contacto.
 */
export function telefonoWhatsApp(telefono: string | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "")
  if (digitos.length < 8) return null

  if (digitos.startsWith("54")) return digitos
  // 0351... → se saca el 0 de larga distancia.
  if (digitos.startsWith("0")) return `54${digitos.slice(1)}`
  return `54${digitos}`
}
