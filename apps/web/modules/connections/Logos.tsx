import { createLucideIcon } from "lucide-react";

/** Logos oficiais das plataformas (Meta: simple-icons, CC0; Google Ads: as três formas da marca nas cores oficiais). */
export function GoogleAdsLogo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 92" width={size} height={size} aria-hidden>
      <line x1="50" y1="17" x2="21" y2="72" stroke="#FBBC04" strokeWidth="27" strokeLinecap="round" />
      <circle cx="21" cy="72" r="15" fill="#34A853" />
      <line x1="50" y1="17" x2="80" y2="72" stroke="#4285F4" strokeWidth="27" strokeLinecap="round" />
    </svg>
  );
}

export function MetaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="meta-grad" x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0" stopColor="#0064E1" /><stop offset="0.5" stopColor="#0082FB" /><stop offset="1" stopColor="#0081FB" />
        </linearGradient>
      </defs>
      <path fill="url(#meta-grad)" d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
    </svg>
  );
}

/** Instagram: o glifo da câmera sobre o degradê oficial. */
export function InstagramLogo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id="ig-grad" cx="0.3" cy="1.07" r="1.3">
          <stop offset="0" stopColor="#FFDD55" /><stop offset="0.1" stopColor="#FFDD55" /><stop offset="0.5" stopColor="#FF543E" /><stop offset="1" stopColor="#C837AB" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="url(#ig-grad)" />
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="16.1" cy="7.9" r="0.95" fill="#fff" />
    </svg>
  );
}

/** Glifo de linha do Instagram no padrão dos ícones lucide (menu lateral, paleta de comandos). */
export const InstagramIcon = createLucideIcon("instagram", [
  ["rect", { x: "2", y: "2", width: "20", height: "20", rx: "5", key: "q" }],
  ["circle", { cx: "12", cy: "12", r: "4", key: "c" }],
  ["line", { x1: "17.5", y1: "6.5", x2: "17.51", y2: "6.5", key: "p" }],
]);

export const LogoPlataforma = ({ p, size }: { p: string; size?: number }) => (p === "META" ? <MetaLogo size={size} /> : p === "INSTAGRAM" ? <InstagramLogo size={size} /> : <GoogleAdsLogo size={size} />);
