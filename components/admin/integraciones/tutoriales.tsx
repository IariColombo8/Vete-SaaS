"use client"

import { TutorialPasos } from "@/components/admin/tutorial-pasos"

/**
 * Guías paso a paso de cada integración de Configuración → Integraciones.
 * Van arriba del formulario correspondiente: el formulario pide el dato
 * (certificado, token, ID) y la guía explica dónde conseguirlo.
 *
 * Nombres de menús y servicios tal como aparecen hoy en ARCA, Mercado Pago y
 * Google. Si alguno cambia de nombre, corregirlo acá.
 */

const ARCA_URL = "https://www.arca.gob.ar/"
const ARCA_WSASS_HOMO = "https://wsass-homo.afip.gob.ar/wsass/portal/"
const MP_DEVELOPERS = "https://www.mercadopago.com.ar/developers/panel/app"
const GOOGLE_CALENDAR = "https://calendar.google.com/"
const GOOGLE_CLOUD_CREDENCIALES = "https://console.cloud.google.com/apis/credentials"
const GOOGLE_CLOUD_GMAIL_API = "https://console.cloud.google.com/apis/library/gmail.googleapis.com"
const EMAILJS = "https://dashboard.emailjs.com/"

/* ═══════════════════════ ARCA · Factura electrónica ═══════════════════════ */

export function TutorialArca({ ambiente, abierto }: { ambiente: "homologacion" | "produccion"; abierto?: boolean }) {
  const homologacion = ambiente === "homologacion"

  return (
    <TutorialPasos
      titulo={homologacion
        ? "Cómo conseguir el certificado de ARCA, paso a paso (homologación: pruebas)"
        : "Cómo conseguir el certificado de ARCA, paso a paso (producción: facturas reales)"}
      abierto={abierto}
      intro={
        <>
          Para facturar, ARCA tiene que reconocer a VetPanel como tu <strong>&quot;computador fiscal&quot;</strong>.
          Eso se hace con un certificado digital: VetPanel genera un pedido (archivo <code>.csr</code>), vos lo subís
          a ARCA con tu clave fiscal, ARCA te devuelve el certificado (archivo <code>.crt</code>) y lo pegás acá. Lleva
          entre 15 y 30 minutos. {homologacion
            ? "En homologación todo es de prueba: nada de lo que emitas tiene valor fiscal, y sirve para verificar que la conexión funciona antes de pasar a producción."
            : "En producción las facturas son reales y quedan registradas en ARCA."}
        </>
      }
      requisitos={[
        <>Tu <strong>CUIT</strong> y tu <strong>clave fiscal</strong> (nivel 3 o superior; si la tenés de nivel 2, se sube desde la app Mi ARCA o en una dependencia).</>,
        <>Estar inscripto frente al IVA (Responsable Inscripto emite Factura A y B; Monotributo emite Factura C).</>,
        <>Un <strong>punto de venta de web services</strong> dado de alta en ARCA (lo explica el paso 8 si todavía no lo tenés).</>,
      ]}
      pasos={[
        {
          donde: "VetPanel",
          titulo: "Completá tus datos fiscales y elegí el ambiente",
          detalle: (
            <>
              En el bloque <strong>1. Datos fiscales</strong> cargá CUIT, razón social (tal cual figura en ARCA), condición
              frente al IVA y punto de venta, y elegí <strong>{homologacion ? "Homologación" : "Producción"}</strong>.
              Guardá. Si es la primera vez, empezá por homologación: el certificado es distinto para cada ambiente.
            </>
          ),
        },
        {
          donde: "VetPanel",
          titulo: "Generá el pedido de certificado (CSR) y descargalo",
          detalle: (
            <>
              En <strong>2. Certificado digital</strong> tocá <strong>Generar pedido de certificado (CSR)</strong> y después
              <strong> Descargar .csr</strong>. VetPanel crea la clave privada y la guarda cifrada en el servidor: nunca
              sale de ahí. El <code>.csr</code> es lo único que le vas a dar a ARCA.
            </>
          ),
          nota: { tipo: "atencion", texto: "Si más adelante generás un CSR nuevo, el certificado anterior deja de servir y hay que repetir los pasos en ARCA." },
        },
        {
          donde: "ARCA",
          titulo: "Ingresá a ARCA con tu clave fiscal",
          detalle: <>Entrá con tu CUIT y clave fiscal. Vas a usar servicios que se agregan desde <strong>Administrador de Relaciones de Clave Fiscal</strong> (está siempre en tu lista de servicios).</>,
          enlace: { href: ARCA_URL, texto: "Abrir ARCA" },
        },
        homologacion
          ? {
              donde: "ARCA",
              titulo: "Habilitá el servicio de certificados de homologación (WSASS)",
              detalle: (
                <>
                  En <strong>Administrador de Relaciones de Clave Fiscal</strong> → <strong>Nueva relación</strong> →
                  <strong> ARCA</strong> → <strong>WebServices</strong> → buscá{" "}
                  <strong>&quot;WSASS - Autogestión Certificados Homologación&quot;</strong>, confirmá y salí y volvé a
                  entrar para que aparezca en tus servicios.
                </>
              ),
              enlace: { href: ARCA_WSASS_HOMO, texto: "Abrir WSASS (homologación)" },
            }
          : {
              donde: "ARCA",
              titulo: "Entrá a “Administración de Certificados Digitales”",
              detalle: (
                <>
                  Si no lo ves en tus servicios, agregalo: <strong>Administrador de Relaciones de Clave Fiscal</strong> →
                  <strong> Nueva relación</strong> → <strong>ARCA</strong> → <strong>Servicios Interactivos</strong> →
                  <strong> Administración de Certificados Digitales</strong>. Después de confirmar, salí y volvé a entrar.
                </>
              ),
            },
        homologacion
          ? {
              donde: "ARCA",
              titulo: "Creá el certificado con tu CSR",
              detalle: (
                <>
                  En WSASS elegí <strong>Nuevo certificado</strong>, poné un nombre simbólico (por ejemplo{" "}
                  <code>vetpanel</code>), pegá el contenido del <code>.csr</code> (abrilo con el Bloc de notas y copiá
                  todo, desde <code>-----BEGIN CERTIFICATE REQUEST-----</code> hasta el <code>END</code>) y confirmá.
                  WSASS te muestra el certificado: copialo o descargalo (es el <code>.crt</code>).
                </>
              ),
            }
          : {
              donde: "ARCA",
              titulo: "Agregá un alias y subí el CSR",
              detalle: (
                <>
                  Tocá <strong>Agregar alias</strong>, escribí un nombre (por ejemplo <code>vetpanel</code>), seleccioná el
                  archivo <code>.csr</code> que descargaste y confirmá. Cuando aparezca en la lista, tocá <strong>Ver</strong>{" "}
                  y descargá el certificado: es un archivo <code>.crt</code>.
                </>
              ),
              nota: { tipo: "consejo", texto: "El certificado dura 2 años. Cerca del vencimiento VetPanel te lo avisa en esta pantalla; se renueva repitiendo desde el paso 2." },
            },
        homologacion
          ? {
              donde: "ARCA",
              titulo: "Autorizá el servicio de facturación para ese certificado",
              detalle: (
                <>
                  En WSASS → <strong>Crear autorización a servicio</strong>: elegí el certificado que acabás de crear y el
                  servicio <strong>wsfe</strong> (Facturación Electrónica). Sin esto, ARCA acepta la conexión pero rechaza
                  emitir.
                </>
              ),
            }
          : {
              donde: "ARCA",
              titulo: "Autorizá el servicio “Facturación Electrónica” para ese certificado",
              detalle: (
                <>
                  <strong>Administrador de Relaciones de Clave Fiscal</strong> → <strong>Nueva relación</strong> →{" "}
                  <strong>ARCA</strong> → <strong>WebServices</strong> → <strong>Facturación Electrónica</strong>. En
                  &quot;Representante&quot; elegí el <strong>computador fiscal</strong> con el alias que creaste (por
                  ejemplo <code>vetpanel</code>) y confirmá.
                </>
              ),
              nota: { tipo: "atencion", texto: "Es el paso que más se olvida. Si al probar la conexión ARCA responde que no estás autorizado, es esto." },
            },
        {
          donde: "VetPanel",
          titulo: "Pegá el certificado (.crt) y guardalo",
          detalle: (
            <>
              Abrí el <code>.crt</code> con el Bloc de notas, copiá todo el contenido (desde{" "}
              <code>-----BEGIN CERTIFICATE-----</code> hasta <code>-----END CERTIFICATE-----</code>) y pegalo en el campo
              <strong> Certificado (.crt) que devolvió ARCA</strong>. VetPanel verifica que corresponda a la clave que
              generó: si no coincide, te lo dice en el momento.
            </>
          ),
        },
        {
          donde: "ARCA",
          titulo: "Verificá el punto de venta",
          detalle: (
            <>
              El número de punto de venta que cargaste tiene que existir en ARCA para <strong>web services</strong>.
              Se administra en <strong>Administración de puntos de venta y domicilios</strong> → <strong>A/B/M de
              puntos de venta</strong>: si no lo tenés, agregá uno nuevo eligiendo el sistema de{" "}
              <strong>web services</strong> (&quot;RECE para aplicativo y web services&quot; o &quot;Factura
              Electrónica - Monotributo - Web Services&quot;, según tu condición). El punto de venta de la factura en
              línea del sitio de ARCA no sirve para esto.
            </>
          ),
        },
        {
          donde: "VetPanel",
          titulo: "Probá la conexión",
          detalle: (
            <>
              Tocá <strong>Probar conexión</strong>. VetPanel pide un ticket de acceso a ARCA con tu certificado y
              consulta el servicio de facturación. Si responde OK, ya podés facturar desde el mostrador
              {homologacion ? " (en homologación, sin valor fiscal)" : ""}. Si da error, el mensaje dice qué paso
              falta: certificado no autorizado (paso 6), punto de venta inexistente (paso 8) o CUIT/datos que no
              coinciden (paso 1).
            </>
          ),
          nota: homologacion
            ? { tipo: "consejo", texto: "Cuando todo funcione en homologación, cambiá el ambiente a Producción y repetí desde el paso 2 con un certificado nuevo: los de prueba no sirven en producción." }
            : undefined,
        },
      ]}
    />
  )
}

/* ═══════════════════════ Mercado Pago Point ═══════════════════════ */

export function TutorialPoint({ abierto }: { abierto?: boolean }) {
  return (
    <TutorialPasos
      titulo="Cómo conectar tu terminal Point, paso a paso"
      abierto={abierto}
      intro={
        <>
          Vas a crear una &quot;aplicación&quot; en la cuenta de Mercado Pago de la veterinaria y copiar su{" "}
          <strong>Access Token</strong>: con eso VetPanel puede mandar el monto a tu terminal Point y registrar la
          venta cuando el pago se aprueba. Lleva unos 10 minutos y se hace una sola vez.
        </>
      }
      requisitos={[
        <>Una <strong>terminal Point</strong> (Smart o similar) ya vinculada a la cuenta de Mercado Pago de la veterinaria y conectada a internet.</>,
        <>El usuario y la contraseña de <strong>esa</strong> cuenta de Mercado Pago (no una personal).</>,
      ]}
      pasos={[
        {
          donde: "Mercado Pago",
          titulo: "Entrá a Mercado Pago Developers con la cuenta de la veterinaria",
          detalle: <>Es el panel para integraciones de Mercado Pago. Iniciá sesión con la misma cuenta a la que está vinculada la terminal.</>,
          enlace: { href: MP_DEVELOPERS, texto: "Abrir Mercado Pago Developers" },
        },
        {
          donde: "Mercado Pago",
          titulo: "Creá una aplicación",
          detalle: (
            <>
              Tocá <strong>Crear aplicación</strong>, ponele un nombre (por ejemplo <code>VetPanel</code>) y, cuando
              pregunte qué vas a integrar, elegí <strong>Pagos presenciales</strong> → <strong>Point</strong>. Confirmá.
            </>
          ),
        },
        {
          donde: "Mercado Pago",
          titulo: "Copiá el Access Token de producción",
          detalle: (
            <>
              Dentro de la aplicación, en el menú de la izquierda, entrá a <strong>Credenciales de producción</strong> y
              copiá el <strong>Access Token</strong> (empieza con <code>APP_USR-</code>). Si el panel pide activar las
              credenciales de producción primero, completá los datos que pide (rubro y sitio web) y volvé a copiarlo.
            </>
          ),
          nota: { tipo: "atencion", texto: "Es el de producción, no el de prueba: con el token de prueba la terminal real no aparece." },
        },
        {
          donde: "VetPanel",
          titulo: "Pegá el token y tocá Conectar",
          detalle: (
            <>
              VetPanel lo valida consultando las terminales de tu cuenta y lo guarda cifrado en el servidor; no se
              vuelve a mostrar. Si te dice que la cuenta no tiene terminales, revisá que la Point esté vinculada a esa
              misma cuenta.
            </>
          ),
        },
        {
          donde: "VetPanel",
          titulo: "Elegí la terminal con la que vas a cobrar",
          detalle: <>Aparece la lista de terminales de la cuenta. Al elegir una, VetPanel la pasa a <strong>modo punto de venta (PDV)</strong>: así la terminal espera que el monto se lo mande el sistema en vez de tipearlo a mano.</>,
        },
        {
          donde: "Terminal Point",
          titulo: "Apagá y prendé la terminal",
          detalle: (
            <>
              Hace falta reiniciarla una vez para que tome el modo PDV. Para verificar: en la terminal, <strong>Más
              opciones</strong> → <strong>Configuración</strong> → <strong>Modo de vinculación</strong> tiene que decir PDV.
            </>
          ),
          nota: { tipo: "consejo", texto: "Mercado Pago permite una sola terminal en modo PDV por punto de venta. Si tenés varias, la que elegís acá es la que recibe los cobros del mostrador." },
        },
        {
          donde: "VetPanel",
          titulo: "Cobrá desde el mostrador",
          detalle: <>En <strong>Punto de venta</strong> aparece <strong>Cobrar con Point</strong>: el monto viaja a la terminal, el cliente paga y la venta se registra sola con el comprobante de Mercado Pago.</>,
        },
      ]}
    />
  )
}

/* ═══════════════════════ Google Calendar ═══════════════════════ */

export function TutorialCalendar({ abierto }: { abierto?: boolean }) {
  return (
    <TutorialPasos
      titulo="Cómo hacer que los turnos aparezcan en tu Google Calendar"
      abierto={abierto}
      intro={
        <>
          VetPanel crea un evento por cada turno confirmado en el calendario de la cuenta de Google que conectes.
          Lleva 5 minutos.
        </>
      }
      requisitos={[<>Una cuenta de Google (Gmail) de la veterinaria, con acceso a Google Calendar.</>]}
      pasos={[
        {
          donde: "VetPanel",
          titulo: "Conectá la cuenta de Google en la pestaña Email",
          detalle: (
            <>
              En <strong>Integraciones</strong> → <strong>Email</strong>, elegí <strong>Gmail API (tu propia cuenta)</strong>{" "}
              y seguí esa guía hasta <strong>Conectar con Google</strong>. Al autorizar, Google pide permiso para enviar
              emails <em>y</em> para crear eventos en tu calendario: es la misma conexión para las dos cosas.
            </>
          ),
          nota: { tipo: "consejo", texto: "Si preferís no conectar tu cuenta, los turnos igual se pueden crear en un calendario compartido con VetPanel: escribinos y te pasamos el email con el que tenés que compartirlo." },
        },
        {
          donde: "Google Calendar",
          titulo: "Decidí en qué calendario van los turnos",
          detalle: (
            <>
              Si dejás el campo de abajo vacío, los turnos van al calendario principal de la cuenta conectada. Si
              querés uno aparte (recomendado), en Google Calendar tocá el <strong>+</strong> al lado de &quot;Otros
              calendarios&quot; → <strong>Crear calendario</strong>, por ejemplo &quot;Turnos&quot;.
            </>
          ),
          enlace: { href: GOOGLE_CALENDAR, texto: "Abrir Google Calendar" },
        },
        {
          donde: "Google Calendar",
          titulo: "Copiá el ID del calendario",
          detalle: (
            <>
              Pasá el mouse sobre el calendario en la lista de la izquierda → <strong>⋮</strong> → <strong>Configuración
              y uso compartido</strong> → bajá hasta <strong>Integrar el calendario</strong> → copiá{" "}
              <strong>ID del calendario</strong>. Es un email (<code>clinica@gmail.com</code>) o algo como{" "}
              <code>xxxxxxxx@group.calendar.google.com</code>.
            </>
          ),
        },
        {
          donde: "VetPanel",
          titulo: "Pegalo y guardá",
          detalle: <>Pegá el ID en el campo de abajo y tocá <strong>Guardar</strong>. El próximo turno confirmado ya aparece en ese calendario.</>,
        },
      ]}
    />
  )
}

/* ═══════════════════════ Email ═══════════════════════ */

export function TutorialEmail({ proveedor, abierto, origen }: {
  proveedor: "resend" | "gmail" | "emailjs"
  abierto?: boolean
  /** Origen del sitio (https://www.vetpanel.com.ar) para armar la URL de redirección. */
  origen: string
}) {
  if (proveedor === "resend") {
    return (
      <TutorialPasos
        titulo="Emails con Resend (predeterminado): no hay nada que configurar"
        abierto={abierto}
        intro={
          <>
            Con esta opción las confirmaciones y recordatorios salen desde la cuenta de email de VetPanel, con el nombre
            de tu veterinaria. No tenés que hacer nada más. Elegí <strong>Gmail</strong> si querés que salgan desde tu
            propia casilla (y que las respuestas te lleguen a vos), o <strong>EmailJS</strong> si ya usás ese servicio.
          </>
        }
        pasos={[
          { donde: "VetPanel", titulo: "Dejá el proveedor en Resend", detalle: <>Ya está activo. Los clientes reciben los emails con el remitente de VetPanel y el nombre de tu clínica.</> },
          { donde: "VetPanel", titulo: "Revisá el email de contacto en Clínica", detalle: <>En la pestaña <strong>Clínica</strong>, el email que cargás es el que figura como contacto en tu página y en los emails que mandamos.</> },
        ]}
      />
    )
  }

  if (proveedor === "gmail") {
    return (
      <TutorialPasos
        titulo="Cómo conectar tu Gmail, paso a paso"
        abierto={abierto}
        intro={
          <>
            Google exige que cada sistema que envía emails en tu nombre tenga su propio &quot;cliente OAuth&quot;. Se crea
            una vez en Google Cloud (es gratis), se pegan dos datos acá y después autorizás la cuenta con un click.
            Lleva unos 15 minutos.
          </>
        }
        requisitos={[<>La cuenta de Google (Gmail) desde la que querés que salgan los emails.</>]}
        pasos={[
          {
            donde: "Google Cloud",
            titulo: "Creá un proyecto y habilitá la Gmail API",
            detalle: (
              <>
                Entrá a Google Cloud con esa cuenta. Arriba a la izquierda, en el selector de proyectos, tocá{" "}
                <strong>Proyecto nuevo</strong> (por ejemplo <code>VetPanel</code>). Con el proyecto elegido, abrí la
                página de la Gmail API y tocá <strong>Habilitar</strong>.
              </>
            ),
            enlace: { href: GOOGLE_CLOUD_GMAIL_API, texto: "Abrir la Gmail API en Google Cloud" },
          },
          {
            donde: "Google Cloud",
            titulo: "Configurá la pantalla de consentimiento",
            detalle: (
              <>
                En <strong>APIs y servicios</strong> → <strong>Pantalla de consentimiento de OAuth</strong>: tipo de usuario{" "}
                <strong>Externo</strong>, nombre de la app (el de tu veterinaria), tu email de contacto, guardá. En{" "}
                <strong>Usuarios de prueba</strong> agregá la cuenta de Gmail que vas a conectar.
              </>
            ),
            nota: { tipo: "consejo", texto: "Mientras la app esté “en prueba”, solo las cuentas que agregues como usuarios de prueba pueden autorizarla. Para tu propia casilla alcanza." },
          },
          {
            donde: "Google Cloud",
            titulo: "Creá las credenciales OAuth",
            detalle: (
              <>
                En <strong>APIs y servicios</strong> → <strong>Credenciales</strong> → <strong>Crear credenciales</strong> →{" "}
                <strong>ID de cliente de OAuth</strong> → tipo <strong>Aplicación web</strong>. En{" "}
                <strong>URI de redireccionamiento autorizados</strong> agregá exactamente:{" "}
                <code>{origen}/api/gmail/callback</code>. Al crear, Google te muestra el{" "}
                <strong>ID de cliente</strong> y el <strong>Secreto del cliente</strong>: copiá los dos.
              </>
            ),
            enlace: { href: GOOGLE_CLOUD_CREDENCIALES, texto: "Abrir Credenciales en Google Cloud" },
          },
          {
            donde: "VetPanel",
            titulo: "Pegá Client ID y Client Secret y guardá",
            detalle: <>Van en los dos campos de abajo. Quedan guardados cifrados en el servidor.</>,
          },
          {
            donde: "VetPanel",
            titulo: "Tocá “Conectar con Google” y autorizá",
            detalle: (
              <>
                Te lleva a Google: elegí la cuenta, aceptá los permisos de <strong>enviar emails</strong> y{" "}
                <strong>crear eventos en el calendario</strong>, y volvés acá con la cuenta conectada. Desde ese momento
                los emails salen desde tu casilla y los turnos pueden ir a tu Google Calendar.
              </>
            ),
            nota: { tipo: "atencion", texto: "Si Google muestra “Esta app no está verificada”, tocá Configuración avanzada → Ir a (nombre de tu app): es normal mientras la app esté en modo prueba." },
          },
        ]}
      />
    )
  }

  return (
    <TutorialPasos
      titulo="Cómo configurar EmailJS, paso a paso"
      abierto={abierto}
      intro={
        <>
          EmailJS es un servicio externo que envía emails desde tu propia casilla usando una plantilla. Necesitás una
          cuenta en EmailJS, un servicio de email conectado y una plantilla con las variables que VetPanel completa.
        </>
      }
      requisitos={[<>Una cuenta en EmailJS (tiene plan gratuito con límite mensual de envíos).</>]}
      pasos={[
        {
          donde: "EmailJS",
          titulo: "Conectá tu casilla como servicio",
          detalle: <>En <strong>Email Services</strong> → <strong>Add New Service</strong>, elegí tu proveedor (Gmail, Outlook, etc.) y autorizá la cuenta. Copiá el <strong>Service ID</strong>.</>,
          enlace: { href: EMAILJS, texto: "Abrir el panel de EmailJS" },
        },
        {
          donde: "EmailJS",
          titulo: "Creá la plantilla con las variables de VetPanel",
          detalle: (
            <>
              En <strong>Email Templates</strong> → <strong>Create New Template</strong>. En el cuerpo usá estas
              variables, escritas tal cual entre llaves dobles: <code>nombre_y_apellido</code>, <code>fecha</code>,{" "}
              <code>hora</code>, <code>direccion</code>, <code>nombre_mascota</code>, <code>tipo_mascota</code> y{" "}
              <code>servicio_requerido</code>. Guardá y copiá el <strong>Template ID</strong>.
            </>
          ),
          nota: { tipo: "consejo", texto: "Ejemplo: “Hola {{nombre_y_apellido}}, te confirmamos el turno de {{nombre_mascota}} el {{fecha}} a las {{hora}} para {{servicio_requerido}}.”" },
        },
        {
          donde: "EmailJS",
          titulo: "Copiá las dos claves de la cuenta",
          detalle: <>En <strong>Account</strong> → <strong>General</strong> están la <strong>Public Key</strong> y la <strong>Private Key</strong>.</>,
        },
        {
          donde: "VetPanel",
          titulo: "Pegá los cuatro datos y guardá",
          detalle: <>Service ID, Template ID, Public Key y Private Key van en los campos de abajo. La clave privada queda cifrada en el servidor y no se vuelve a mostrar.</>,
        },
      ]}
    />
  )
}
