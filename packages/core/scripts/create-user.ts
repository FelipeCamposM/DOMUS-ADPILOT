import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { tornarOwnerInicial } from "../src/setup";

// Alternativa de terminal ao "Primeiro acesso" da tela de login.
// Uso: pnpm user:create email@x.com "senha-forte" [owner|admin|editor|viewer]
// Cria um usuário no Supabase Auth (conta existente: só dá acesso, sem mexer na senha). Primeiro uso: cria SIAPLUS e DOMUS.
// O usuário entra em todos os workspaces com o papel informado (padrão owner).
const [email, password, role = "owner"] = process.argv.slice(2);
if (!email || !password || password.length < 8 || !["owner", "admin", "editor", "viewer"].includes(role)) {
  console.error('uso: pnpm user:create <email> "<senha com 8+ caracteres>" [owner|admin|editor|viewer]');
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let userId: string;
const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error && /already|registered|exists/i.test(error.message)) {
  const sqlBusca = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
  const [u] = await sqlBusca<{ id: string }[]>`select id from auth.users where lower(email) = lower(${email})`;
  await sqlBusca.end();
  if (!u) throw error;
  // O Supabase é compartilhado com outros sites: nunca trocar a senha de uma conta que já existe.
  userId = u.id;
  console.log(`conta já existia: ${email} (senha NÃO alterada; entre com a senha atual dela)`);
} else if (error) {
  throw error;
} else {
  userId = created.user.id;
  console.log(`usuário criado: ${email}`);
}

const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
if (role === "owner") await tornarOwnerInicial(sql, userId);
else await sql`
  insert into ads.workspace_members (workspace_id, user_id, role) select id, ${userId}, ${role} from ads.workspaces
  on conflict (workspace_id, user_id) do update set role = excluded.role`;
console.log(`${email} é ${role} em todos os workspaces`);
await sql.end();
