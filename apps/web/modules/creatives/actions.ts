"use server";

import { apagarArquivo, audit, db, enqueueJob, MAX_FONTE_MB, MUSICA_TAGS, r2Key, r2Presign, SFX_CATEGORIAS, storageAtual, tamanhoArquivo } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";

const MB = 1048576;
const licenca = z.string().trim().min(3, "Informe a licença ou a origem (ex.: Epidemic Sound, YouTube Audio Library, autoral)").max(200);
const audio = z.string().regex(/^audio\/[\w.+-]+$/, "Envie um arquivo de áudio (MP3, WAV, M4A, OGG)");
/** Áudio exige licença (música/efeito em anúncio). Imagem e vídeo são anexos do Studio (logo, prints, fotos, vídeos do produto). */
const uploadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MUSIC"), tags: z.array(z.enum(MUSICA_TAGS)).min(1, "Escolha ao menos um clima para a música"), mime: audio, license: licenca, size: z.number().int().positive().max(50 * MB, "Arquivo acima de 50 MB") }),
  z.object({ type: z.literal("SFX"), tags: z.array(z.enum(SFX_CATEGORIAS)).min(1, "Escolha a categoria do efeito"), mime: audio, license: licenca, size: z.number().int().positive().max(50 * MB, "Arquivo acima de 50 MB") }),
  z.object({ type: z.literal("IMAGE"), tags: z.tuple([z.literal("asset")]).default(["asset"]), mime: z.string().regex(/^image\/(png|jpe?g|webp|gif|svg\+xml)$/, "Envie PNG, JPG, WEBP, GIF ou SVG"),
    license: z.string().trim().max(200).default(""), size: z.number().int().positive().max(25 * MB, "Imagem acima de 25 MB") }),
  z.object({ type: z.literal("VIDEO"), tags: z.tuple([z.literal("asset")]).default(["asset"]), mime: z.string().regex(/^video\/(mp4|webm|quicktime)$/, "Envie MP4, WEBM ou MOV"),
    license: z.string().trim().max(200).default(""), size: z.number().int().positive().max(MAX_FONTE_MB * MB, `Vídeo acima de ${MAX_FONTE_MB / 1024} GB`) }),
]).and(z.object({
  name: z.string().trim().min(1, "Arquivo sem nome").max(120),
  durationMs: z.number().int().positive().max(3_600_000).nullable(),
  width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(),
  pastaId: z.string().uuid("Pasta inválida").nullable().optional(),
}));
const PASTA = { MUSIC: "music", SFX: "sfx", IMAGE: "images", VIDEO: "videos" } as const;

/**
 * 1º passo do upload: registra o criativo e devolve para onde o navegador manda o arquivo (PUT): a rota da própria
 * plataforma quando o armazenamento é o PC, ou uma URL pré-assinada do R2 (15 min).
 */
export async function iniciarUpload(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const u = uploadSchema.parse(input);
    const id = crypto.randomUUID();
    // extensão vem do tipo validado (nunca do nome enviado)
    const ext = { "image/svg+xml": "svg", "image/jpeg": "jpg", "image/jpg": "jpg", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a" }[u.mime]
      ?? u.mime.split("/")[1]!.replace(/[^a-z0-9]/g, "").slice(0, 5);
    const key = r2Key(ctx.workspace.id, PASTA[u.type], `${id}.${ext}`);
    const storage = storageAtual();
    // pasta só se for deste workspace (senão fica sem pasta)
    await db()`insert into ads.creatives (id, workspace_id, name, type, status, storage, r2_key, mime, size_bytes, duration_ms, width, height, tags, license, created_by, pasta_id)
      values (${id}, ${ctx.workspace.id}, ${u.name.replace(/\.[^.]+$/, "")}, ${u.type}, 'UPLOADING', ${storage}, ${key}, ${u.mime}, ${u.size}, ${u.durationMs},
        ${u.width ?? null}, ${u.height ?? null}, ${u.tags as string[]}, ${u.license || null}, ${ctx.user.id},
        (select p.id from ads.pastas p where p.id = ${u.pastaId ?? null} and p.workspace_id = ${ctx.workspace.id}))`;
    return { id, url: storage === "local" ? `/api/creatives/${id}/upload` : await r2Presign(key, "PUT", 900) };
  });
}

/** 2º passo: confere que o arquivo chegou inteiro (tamanho) e libera para uso. */
export async function concluirUpload(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const sql = db();
    const [c] = await sql<{ storage: string; r2_key: string; size_bytes: string; name: string; type: string }[]>`
      select storage, r2_key, size_bytes::text, name, type from ads.creatives where id = ${z.string().uuid().parse(id)} and workspace_id = ${ctx.workspace.id} and status = 'UPLOADING'`;
    if (!c) throw new Error("Upload não encontrado");
    if ((await tamanhoArquivo(c.storage, c.r2_key)) !== Number(c.size_bytes)) {
      await apagarArquivo(c.storage, c.r2_key).catch(() => {});
      await sql`delete from ads.creatives where id = ${id}`;
      throw new Error("O arquivo não chegou inteiro ao armazenamento. Tente de novo.");
    }
    await sql`update ads.creatives set status = 'READY', updated_at = now() where id = ${id}`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: ({ MUSIC: "Enviar música", SFX: "Enviar efeito sonoro", IMAGE: "Enviar imagem", VIDEO: "Enviar vídeo" } as Record<string, string>)[c.type] ?? "Enviar arquivo", entityType: "creative", entityId: id, entityName: c.name });
    revalidatePath("/creatives");
    revalidatePath("/arquivos");
  });
}

export async function cancelarUpload(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    await db()`delete from ads.creatives where id = ${z.string().uuid().parse(id)} and workspace_id = ${ctx.workspace.id} and status = 'UPLOADING'`;
  });
}

/** Apaga um item da biblioteca (música, efeito ou arquivo enviado). Vídeos/imagens gerados são apagados pelo projeto no Studio. */
export async function apagarCriativo(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const sql = db();
    const [c] = await sql<{ storage: string; r2_key: string | null; name: string; type: string }[]>`
      select storage, r2_key, name, type from ads.creatives where id = ${z.string().uuid().parse(id)} and workspace_id = ${ctx.workspace.id} and (type in ('MUSIC','SFX') or 'asset' = any(tags))`;
    if (!c) throw new Error("Item não encontrado");
    if (c.r2_key) await apagarArquivo(c.storage, c.r2_key);
    await sql`delete from ads.creatives where id = ${id}`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Apagar item da biblioteca", entityType: "creative", entityId: id, entityName: c.name });
    revalidatePath("/creatives");
  });
}

/** "Gerar com ElevenLabs": o worker gera a música/efeito e salva na biblioteca (aparece aqui quando ficar pronto). */
export async function gerarAudioIA(input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("MUSIC"), tag: z.enum(MUSICA_TAGS, { message: "Escolha o clima" }), duracao: z.number().min(10, "Mínimo 10 s").max(180, "Máximo 3 min").default(60) }),
      z.object({ tipo: z.literal("SFX"), tag: z.enum(SFX_CATEGORIAS, { message: "Escolha a categoria" }), duracao: z.number().min(0.5).max(10).optional() }),
    ]).and(z.object({ prompt: z.string().trim().max(400, "Descrição muito longa").default(""), nome: z.string().trim().max(80, "Nome muito longo").default("") })).parse(input);
    const sql = db();
    const [w] = await sql<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
    if (!w?.ok) throw new Error("O worker está offline. Ligue o PC do worker e tente de novo.");
    const [fila] = await sql<{ n: number }[]>`select count(*)::int as n from ads.jobs where type = 'GENERATE_AUDIO' and workspace_id = ${ctx.workspace.id} and status in ('PENDING','RUNNING')`;
    if ((fila?.n ?? 0) >= 5) throw new Error("Já tem 5 áudios sendo gerados: espere terminar");
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "GENERATE_AUDIO", payload: p, createdBy: ctx.user.id, maxAttempts: 1 });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Gerar áudio no ElevenLabs", entityType: "creative", after: { tipo: p.tipo, tag: p.tag } });
    revalidatePath("/creatives");
  });
}

/** Organizar a biblioteca de áudio: nome, clima/categoria e música favorita (a que os vídeos usam primeiro naquele clima). */
export async function editarAudio(id: string, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const sql = db();
    const [c] = await sql<{ type: "MUSIC" | "SFX"; tags: string[] }[]>`select type, tags from ads.creatives where id = ${z.string().uuid().parse(id)} and workspace_id = ${ctx.workspace.id} and type in ('MUSIC','SFX')`;
    if (!c) throw new Error("Áudio não encontrado");
    const e = z.object({
      nome: z.string().trim().min(1, "Nome vazio").max(120, "Nome muito longo").optional(),
      tags: z.array(c.type === "MUSIC" ? z.enum(MUSICA_TAGS) : z.enum(SFX_CATEGORIAS)).min(1, "Escolha ao menos uma").max(c.type === "MUSIC" ? 7 : 1).optional(),
      favorita: z.boolean().optional(),
    }).parse(input);
    if (e.favorita && c.type === "MUSIC") {
      // uma favorita por clima: desmarca as outras dos mesmos climas
      await sql`update ads.creatives set metadata = metadata - 'favorita' where workspace_id = ${ctx.workspace.id} and type = 'MUSIC' and id <> ${id} and tags && ${e.tags ?? c.tags}::text[]`;
    }
    await sql`update ads.creatives set name = coalesce(${e.nome ?? null}, name), tags = coalesce(${e.tags ?? null}::text[], tags),
      metadata = case when ${e.favorita ?? null}::boolean is null then metadata else metadata || jsonb_build_object('favorita', ${e.favorita ?? false}::boolean) end, updated_at = now()
      where id = ${id}`;
    revalidatePath("/creatives");
  });
}
