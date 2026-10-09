import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente Supabase do servidor (só Auth; dados vêm do Postgres direto pelo @domus-ads/core). */
export async function supabase() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) jar.set(c.name, c.value, c.options);
        } catch {
          // Server Component não grava cookie; o proxy renova a sessão.
        }
      },
    },
  });
}
