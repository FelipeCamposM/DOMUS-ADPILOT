import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono-app", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DOMUS AdPilot", template: "%s · DOMUS AdPilot" },
  description: "Tráfego pago, métricas e IA num só lugar.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0A0A0E", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // "anim": o CSS só esconde [data-enter] com JS ligado e sem "reduzir movimento"; o Motion assume ou libera.
  return (
    <html lang="pt-BR" className={`anim ${jakarta.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
