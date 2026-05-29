interface DatosTurno {
  nombre_y_apellido: string;
  fecha: string;
  hora: string;
  direccion: string;
  nombre_mascota: string;
  tipo_mascota: string;
  servicio_requerido: string;
  email: string;
  /** Nombre de la veterinaria (opcional, para personalizar el email). */
  veterinaria?: string;
}

/**
 * Envía el email de confirmación de turno vía la API route server-side
 * (`/api/email/send`, Resend). Reemplaza a EmailJS client-side.
 * Best-effort: devuelve `false` si no se pudo enviar, sin lanzar.
 */
export const enviarEmailConfirmacion = async (
  datos: DatosTurno,
): Promise<boolean> => {
  try {
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    return Boolean(json?.ok);
  } catch (error) {
    console.error("Error al enviar email:", error);
    return false;
  }
};
