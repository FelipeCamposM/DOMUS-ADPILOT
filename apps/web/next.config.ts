import type { NextConfig } from "next";

// Local: lê o .env da raiz do monorepo. Na Vercel as variáveis vêm do painel (o arquivo não existe).
try {
  process.loadEnvFile("../../.env");
} catch {}

const config: NextConfig = {
  transpilePackages: ["@domus-ads/core"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
};

export default config;
