/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // No activar `experimental.inlineCss` (probado en 16.1.6 con Turbopack): mete
  // el CSS sin minificar (~300 KB) en un <style> y lo repite en el payload RSC,
  // así que el HTML de la landing pasa de ~20 KB a ~110 KB comprimidos y el
  // FCP empeora en vez de mejorar.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ]
  },
}

export default nextConfig
