import type { Metadata } from "next";
import localFont from "next/font/local";
import {
  Poppins,
  Montserrat,
  Sora,
  Playfair_Display,
  Nunito,
} from "next/font/google";
import "./globals.css";

const inter = localFont({
  src: "../public/fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

// The renderer draws weights 400/500/600/700/800 (Theme weights + subhead 500),
// so every selectable family must ship all five, or assertRenderFonts throws on
// export. Self-hosted by next/font at build time — no runtime fetch. next/font
// is a compile-time transform: each call's options must be inline literals (no
// spread / shared config), hence the repetition.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-poppins",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-montserrat",
});
const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sora",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-playfair",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-nunito",
});

const fontVars = [inter, poppins, montserrat, sora, playfair, nunito]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "Store Shots",
  description: "App Store / Play Store screenshot generator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontVars} ${inter.className} h-full antialiased`}>
      <body className="h-full min-h-screen bg-neutral-950 text-neutral-200">
        {children}
      </body>
    </html>
  );
}
