import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

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
    url: process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app",
    siteName: "VetPanel",
    title: "VetPanel — Sistema de gestión para Veterinarias",
    description: "Controlá turnos, clientes y libretas sanitarias desde un solo lugar.",
    images: [{ url: "/metadato.jpg", width: 1200, height: 630, alt: "VetPanel" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VetPanel — Sistema de gestión para Veterinarias",
    description: "Controlá turnos, clientes y libretas sanitarias desde un solo lugar.",
    images: ["/metadato.jpg"],
  },
  icons: {
    icon: [
      { url: "/icon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.png", media: "(prefers-color-scheme: dark)" },
      { url: "/logo111.png", type: "image/png" },
    ],
    apple: "/logo111.png",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app"),
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`font-sans antialiased`}>
        <Navbar />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
