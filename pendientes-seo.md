# Pendientes — SEO y presencia de vetpanel.com.ar

Seguimiento del plan para posicionar la web de VetPanel en Google.
Actualizado: 2026-10-06.

## Hecho

- [x] Dominio `vetpanel.com.ar` verificado en Google Search Console (registro TXT en Vercel).
- [x] Sitemap enviado a Search Console: `https://www.vetpanel.com.ar/sitemap.xml`.
- [x] Sitio importado en Bing Webmaster Tools.
- [x] Auditoría de la landing: `/pricing` fuera de Google hasta definir precios, metadata propia
      en `/registro`, H1 con "Software para veterinarias", datos estructurados en el blog.
- [x] 4 artículos nuevos en el blog: turnos, recordatorios de vacunas, libreta sanitaria,
      historia clínica.

## Pendiente

### Capterra (en curso)

- [ ] Completar la ficha de VetPanel en Capterra (también publica en GetApp y Software Advice).
      Los textos en español e inglés, categorías, funciones y datos técnicos se armaron en la
      sesión del 2026-10-06. Precios: **sin montos** hasta que sean definitivos (versión gratuita: sí).
- [ ] **Capturas para Capterra (3 a 5).** Sacarlas desde una veterinaria de prueba con datos
      inventados, nunca con datos reales de clientes (VipVet, Mundo Animal):
  - [ ] Página pública de turnos de la veterinaria
  - [ ] Panel de turnos
  - [ ] Historia clínica de una mascota
  - [ ] Libreta sanitaria en el celular
  - [ ] Punto de venta
- [ ] Subir el logo cuadrado (`public/logo.png`).

### Resto del punto 4 — presencia fuera del sitio

- [ ] Crear/confirmar redes de VetPanel (Instagram, LinkedIn, Facebook) con el link a la web en la bio.
- [ ] Pasar los links de las redes para agregarlos al pie de la web y a los datos
      estructurados (`sameAs` en `lib/seo/datos-estructurados.ts`).
- [ ] Ficha en G2 (`sell.g2.com`).
- [ ] Pedir reseñas reales a VipVet y Mundo Animal (Capterra o Google).
      Con varias reseñas reales se puede sumar `aggregateRating` a la landing — **nunca inventadas**.
- [x] Google Maps: no se crea perfil propio de VetPanel, se usa el de ServiTec
      (`https://maps.app.goo.gl/HqguXzHvLLCMghW8A`, en `SERVITEC.mapsUrl` de `lib/marca.ts`).
      Ya está vinculado en los datos estructurados de la landing (`sameAs` de ServiTec).
- [ ] En el perfil de Google Business de ServiTec: Editar perfil → Productos/Servicios → agregar
      "VetPanel – Software para veterinarias" con el link `https://www.vetpanel.com.ar`.

### Punto 5 — medir (desde ~2026-10-20)

- [ ] Revisar Search Console → Rendimiento: qué búsquedas traen visitas y en qué posición.
- [ ] Revisar Search Console → Páginas: qué se indexó y qué no.
- [ ] Ajustar textos y elegir los próximos artículos según esos datos.

### Contenido y landing

- [ ] Seguir con un artículo de blog por semana (palabras clave definidas: problemas concretos →
      funciones del producto → producto en general).
- [ ] Testimonios de la landing (`components/landing/testimonials.tsx`) son de ejemplo:
      reemplazarlos por reales cuando haya.
- [ ] El hero muestra "★★★★★ 4.9 · +50 veterinarias": confirmar que el dato sea real o cambiarlo.
- [ ] Cuando los precios sean definitivos: sacar el `noindex` de `/pricing`, volver a sumarla al
      sitemap y enlazarla desde el menú y el pie de la landing.

### Técnico (fuera del SEO de la landing)

- [ ] **Seguridad:** el mapa de la página pública de cada veterinaria inserta tal cual el código
      pegado en Configuración (`app/[slug]/vet-public-view.tsx:795` y la vista previa en
      Configuración). Dibujar siempre nosotros el `<iframe>` con la URL extraída y solo si es de
      Google Maps (se puede reusar `leerMapa`).
- [ ] Arreglo de `hasMap`/`geo` en los datos estructurados de cada veterinaria
      (`lib/seo/veterinaria.ts` + test): hecho en local, **sin commitear**.
