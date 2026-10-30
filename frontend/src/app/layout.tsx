import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import { PwaSetup } from "@/components/pwa-setup";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Futsal Stats",
  description: "Gestión del equipo: plantilla, puntos, convocatorias y partidos en vivo",
  manifest: "/manifest.webmanifest",
  icons: {
    // El SVG, para los navegadores modernos. El .ico (16, 32 y 48 px) lo enlaza Next por convención.
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Futsal Stats", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <PwaSetup />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
