import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";
import "./tema.css"; // por último: o visual (trilho roxo, hero, painéis) por cima das regras base

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-sora", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono-app", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DOMUS AdPilot", template: "%s · DOMUS AdPilot" },
  description: "Tráfego pago, métricas e IA num só lugar.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#050407", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // "anim": o CSS só esconde [data-enter] com JS ligado e sem "reduzir movimento"; o Motion assume ou libera.
  return (
    <html lang="pt-BR" className={`anim ${inter.variable} ${sora.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
