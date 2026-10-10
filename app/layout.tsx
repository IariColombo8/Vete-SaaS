import type React from "react";
import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Fraunces: serif display para titulares. Pesos estáticos (600/700) en vez del
// variable completo → archivo mucho más liviano y mejor LCP en mobile.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});
// DM Sans: sans limpia y cálida para el cuerpo.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VetPanel — Sistema de gestión para Veterinarias",
  description:
    "Controlá turnos, clientes y libretas sanitarias desde un solo lugar. Tu clínica online con tu propio link, en minutos.",
  keywords: [
    "sistema gestión veterinaria",
    "turnos veterinaria online",
    "libreta sanitaria digital",
    "software veterinaria",
    "agenda veterinaria",
  ],
  authors: [{ name: "VetPanel" }],
  creator: "VetPanel",
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar",
    siteName: "VetPanel",
    title: "VetPanel — Sistema de gestión para Veterinarias",
    description: "Controlá turnos, clientes y libretas sanitarias desde un solo lugar.",
    images: [
      {
        url: "/metadato.png",
        width: 1200,
        height: 630,
        alt: "VetPanel Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VetPanel — Sistema de gestión para Veterinarias",
    description: "Controlá turnos, clientes y libretas sanitarias desde un solo lugar.",
    images: ["/metadato.png"],
  },
  // Íconos redimensionados con sharp desde public/logo.png: favicon.ico lleva
  // capas de 16/32/48 (Google pide múltiplos de 48). `favicon.ico` tiene que
  // existir en public/: sin ese archivo, /favicon.ico cae en la ruta dinámica
  // app/[slug] y devuelve HTML, con una query a Supabase por cada pedido.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar"),
  // Sin `alternates.canonical` acá: lo heredaban TODAS las páginas que no
  // definen el suyo (reservar turno, productos de cada veterinaria, login…) y
  // Google las trataba como copias de la landing. Cada página declara el suyo.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body className={`font-sans antialiased`}>
        <Navbar />
        {children}
        <Toaster richColors closeButton />
        <Analytics />
      </body>
    </html>
  );
}
