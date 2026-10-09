import { decrypt } from "../crypto";
import { GoogleAdsProvider, type GoogleCredentials } from "./google";
import { MetaAdsProvider, type MetaCredentials } from "./meta";
import type { AdsProvider, Provider } from "./types";

export * from "./types";
export { MetaAdsProvider, GoogleAdsProvider };
export { errosGoogle } from "./google";

export function providerFor(provider: Provider | string, credentialsEnc: string): AdsProvider {
  if (provider === "META") return new MetaAdsProvider(decrypt<MetaCredentials>(credentialsEnc));
  if (provider === "GOOGLE") return new GoogleAdsProvider(decrypt<GoogleCredentials>(credentialsEnc));
  throw new Error(`provider desconhecido: ${provider}`);
}
