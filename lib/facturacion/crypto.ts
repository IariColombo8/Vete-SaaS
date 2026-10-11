import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Cifrado de la clave privada del certificado de cada veterinaria antes de
 * guardarla en `tenant_fiscal.key_pem_enc`.
 *
 * AES-256-GCM con `FACTURACION_ENCRYPTION_KEY` (32 bytes en hex). Formato
 * guardado: base64( iv[12] ‖ tag[16] ‖ ciphertext ). Si se rota la clave hay
 * que recifrar todas las filas: no hay versión en el formato a propósito, para
 * no complicar algo que no debería pasar.
 */

function claveMaestra(): Buffer {
  const hex = process.env.FACTURACION_ENCRYPTION_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("FACTURACION_ENCRYPTION_KEY falta o no son 32 bytes en hex")
  }
  return Buffer.from(hex, "hex")
}

export function isFacturacionCryptoConfigured(): boolean {
  const hex = process.env.FACTURACION_ENCRYPTION_KEY
  return Boolean(hex && /^[0-9a-fA-F]{64}$/.test(hex))
}

export function cifrar(textoPlano: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", claveMaestra(), iv)
  const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, cifrado]).toString("base64")
}

export function descifrar(guardado: string): string {
  const buf = Buffer.from(guardado, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const cifrado = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", claveMaestra(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8")
}
