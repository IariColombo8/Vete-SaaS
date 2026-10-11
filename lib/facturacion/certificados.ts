import "server-only"
import forge from "node-forge"

/**
 * Certificados para los web services de ARCA.
 *
 * VetPanel genera el par de claves y el CSR; la veterinaria sube el CSR en
 * ARCA → "Administración de Certificados Digitales", baja el certificado
 * (.crt) y lo pega en el panel. La clave privada nunca sale del servidor.
 *
 * Subject recomendado por ARCA: C=AR, O=<razón social>, CN=<alias>,
 * serialNumber=CUIT <cuit>.
 */

export interface ParClaves {
  privateKeyPem: string
  csrPem: string
}

export function generarClaveYCsr(params: { cuit: string; razonSocial: string; alias: string }): ParClaves {
  // 2048 bits es lo que exige ARCA. Sincrónico: tarda ~1 s, aceptable en una
  // acción puntual de configuración.
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })

  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: limpiarSubject(params.razonSocial) },
    { name: "commonName", value: limpiarSubject(params.alias) },
    { name: "serialNumber", value: `CUIT ${params.cuit.replace(/\D/g, "")}` },
  ])
  csr.sign(keys.privateKey, forge.md.sha256.create())

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    csrPem: forge.pki.certificationRequestToPem(csr),
  }
}

/** ARCA rechaza acentos y símbolos raros en el subject. */
function limpiarSubject(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-_]/g, "")
    .trim()
    .slice(0, 64) || "VetPanel"
}

export interface InfoCertificado {
  vence: Date
  emitido: Date
  subject: string
  /** El certificado corresponde a la clave privada guardada. */
  coincideConClave: boolean
}

/**
 * Valida el certificado pegado por la veterinaria: que sea un PEM válido y
 * que la clave pública sea la de la clave privada que generamos. Si no
 * coincide, ARCA va a rechazar la firma y el error sería incomprensible.
 */
export function inspeccionarCertificado(certPem: string, privateKeyPem: string): InfoCertificado {
  const cert = forge.pki.certificateFromPem(normalizarPem(certPem))
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  const pubDeKey = forge.pki.setRsaPublicKey(key.n, key.e)
  const coincideConClave =
    forge.pki.publicKeyToPem(pubDeKey) === forge.pki.publicKeyToPem(cert.publicKey as forge.pki.rsa.PublicKey)

  return {
    vence: cert.validity.notAfter,
    emitido: cert.validity.notBefore,
    subject: cert.subject.attributes.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(", "),
    coincideConClave,
  }
}

/** Acepta el .crt tal como lo baja ARCA (a veces sin saltos de línea o con CRLF). */
export function normalizarPem(pem: string): string {
  const limpio = pem.replace(/\r/g, "").trim()
  if (limpio.includes("-----BEGIN CERTIFICATE-----")) return limpio
  // Solo base64: se le ponen los delimitadores.
  const cuerpo = limpio.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? ""
  return `-----BEGIN CERTIFICATE-----\n${cuerpo}\n-----END CERTIFICATE-----`
}
