import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "APEX KART — Turbo Party",
  description: "Kart racer 3D estilo party racing: 12 corredores originales, 12 pistas temáticas, drift con mini-turbo, 13 objetos, IA competitiva y 4 modos de juego. Un juego original de APEX Studio.",
  keywords: ["kart racer", "party racing", "3D", "drift", "Three.js", "APEX Studio"],
  authors: [{ name: "APEX Studio" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "APEX KART — Turbo Party",
    description: "Kart racer 3D con drift, objetos y 12 pistas originales.",
    siteName: "APEX KART",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "APEX KART — Turbo Party",
    description: "Kart racer 3D con drift, objetos y 12 pistas originales.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white overflow-hidden`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
