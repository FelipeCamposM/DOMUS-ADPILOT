import "./env"; // primeiro: carrega o .env
import { db } from "@domus-ads/core";
import { migrarLocais } from "./video/arquivo";

// pnpm media:migrar → sobe para o R2 (e copia no Drive) a mídia que ainda está no disco do PC
await migrarLocais();
await db().end();
