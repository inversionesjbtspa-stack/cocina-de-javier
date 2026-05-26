import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cocina de Javier ERP",
  description: "ERP financiero y operativo La Cocina de Javier",
  icons: {
    apple: "/apple-touch-icon.svg",
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/logo-lcdj.gif", type: "image/gif" }
    ],
    shortcut: "/favicon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
