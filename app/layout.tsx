import type React from "react";
import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Navbar } from "@/components/navbar";
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
    url: process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel-servitec.vercel.app",
    siteName: "VetPanel",
    title: "VetPanel — Sistema de gestión para Veterinarias",
    description: "Controlá turnos, clientes y libretas sanitarias desde un solo lugar.",
    images: [
      {
        url: "/34459d4c-f8b8-433a-8743-402fe3cf5f70.png",
        width: 1200,
        height: 630,
        alt: "VetPanel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VetPanel — Sistema de gestión para Veterinarias",
    description: "Controlá turnos, clientes y libretas sanitarias desde un solo lugar.",
    images: ["/34459d4c-f8b8-433a-8743-402fe3cf5f70.png"],
  },
  icons: {
    icon: [
      { url: "/icon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.png", media: "(prefers-color-scheme: dark)" },
      { url: "/logo111.png", type: "image/png" },
    ],
    apple: "/logo111.png",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel-servitec.vercel.app"),
  alternates: { canonical: "/" },
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
        <Analytics />
      </body>
    </html>
  );
}
