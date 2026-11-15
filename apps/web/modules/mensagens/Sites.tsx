"use client";

import { CONSENTIMENTO, leadSiteSchema, preencherModelo } from "@domus-ads/core/mensagens";
import { ArrowRight, BarChart3, Code2, Copy, ExternalLink, FileJson, Globe, KeyRound, Loader2, MessageCircle, Pause, Pencil, Play, Plug, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GoogleAnalyticsLogo, SearchConsoleLogo } from "../connections/Logos";
import { HeroFx } from "../shell/HeroFx";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { alternarSite, apagarSite, salvarContaGoogle, salvarSite } from "./actions";
import { ha, type SiteLead } from "./Mensagens";

import { Seletor } from "../shell/Seletor";
const MSG_PADRAO = "Olá! Vim pelo site {site} e quero saber mais.";

/** Formulário pronto para colar no site: manda o lead e abre o WhatsApp dele já com a mensagem escrita. */
function codigoFormulario(origem: string, chave: string) {
  return `<!-- Formulário de contato · DOMUS AdPilot -->
<form class="domus-lead" action="${origem}/api/leads" method="post">
  <input type="hidden" name="site" value="${chave}">
  <input name="nome" placeholder="Seu nome" required minlength="2" maxlength="80" autocomplete="name">
  <input name="numero" type="tel" placeholder="WhatsApp com DDD" required autocomplete="tel">
  <textarea name="mensagem" placeholder="Como podemos ajudar? (opcional)" maxlength="1000" rows="3"></textarea>
  <label class="domus-lead-ok"><input type="checkbox" name="consentimento" value="sim" required> ${CONSENTIMENTO}</label>
  <input name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
  <button type="submit">Falar no WhatsApp</button>
  <p class="domus-lead-erro" role="alert" hidden></p>
</form>
<style>
  .domus-lead { --cor: #25d366; display: grid; gap: 10px; max-width: 420px; font: inherit; }
  .domus-lead input:not([type=checkbox]), .domus-lead textarea { padding: 12px 14px; border: 1px solid #d0d5dd; border-radius: 10px; font: inherit; }
  .domus-lead-ok { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
  .domus-lead button { padding: 13px; border: 0; border-radius: 10px; background: var(--cor); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  .domus-lead button:disabled { opacity: .6; }
  .domus-lead-erro { margin: 0; color: #d92d20; font-size: 14px; }
</style>
<script>
  document.querySelectorAll("form.domus-lead").forEach(function (f) {
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var b = f.querySelector("button"), erro = f.querySelector(".domus-lead-erro");
      var d = Object.fromEntries(new FormData(f));
      d.pagina = location.href;
      new URLSearchParams(location.search).forEach(function (v, k) { if (k.indexOf("utm_") === 0) d[k] = v; });
      b.disabled = true; erro.hidden = true;
      try {
        var r = await fetch(f.action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
        var j = await r.json();
        if (!r.ok) throw new Error(j.erro);
        f.innerHTML = "<p>Recebemos seu contato! " + (j.whatsapp ? "Abrindo o WhatsApp…" : "Em breve falamos com você pelo WhatsApp.") + "</p>";
        if (j.whatsapp) location.href = j.whatsapp;
      } catch (err) {
        erro.textContent = err.message || "Não deu para enviar. Tente de novo.";
        erro.hidden = false; b.disabled = false;
      }
    });
  });
</script>`;
}

type Edicao = { id: string | null; nome: string; dominios: string; mensagem_inicial: string; ga4: string; gsc: string };

/** Sites: cada um tem formulário de leads (ou chega por API) e, com a conta Google, as estatísticas do GA4 e do Search Console. */
export function Sites({ sites, contaGoogle }: { sites: SiteLead[]; contaGoogle: string | null }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [codigo, setCodigo] = useState<SiteLead | null>(null);
  const novo = () => setEdit({ id: null, nome: "", dominios: "", mensagem_inicial: MSG_PADRAO, ga4: "", gsc: "" });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <HeroFx />
        <div className="eyebrow" data-enter>CRM</div>
        <div>
          <h1 className="page-title" data-enter>Sites</h1>
          <p className="page-sub" style={{ margin: "8px 0 0" }}>Formulários que viram leads no WhatsApp e as visitas e buscas de cada site.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={novo}><Plus aria-hidden /> Conectar site</button>
      </div>

      <div className="crm-passos" data-enter>
        {[
          [Globe, "1. Cadastre o site", "Nome e domínio. Só esse domínio consegue mandar leads."],
          [Code2, "2. Cole o formulário", "Copie o código e cole no HTML, onde o formulário deve aparecer."],
          [MessageCircle, "3. O lead chama você", "O WhatsApp da pessoa abre com a mensagem pronta e ela começa a conversa."],
        ].map(([I, t, d], i) => {
          const Icone = I as typeof Globe;
          return (
            <div key={i} className="crm-passo">
              <span className="crm-passo-ic"><Icone size={18} aria-hidden /></span>
              <span className="stack" style={{ gap: 2 }}><b>{t as string}</b><span className="subtle small">{d as string}</span></span>
              {i < 2 && <ArrowRight className="crm-passo-seta" size={16} aria-hidden />}
            </div>
          );
        })}
      </div>

      <ContaGoogle email={contaGoogle} />

      <h2 className="crm-h2">Sites conectados <span className="subtle">{sites.length}</span></h2>

      {sites.length ? (
        <div className="crm-sites">
          {sites.map((st) => {
            const api = st.chave.startsWith("sistema:");
            const stats = !!(st.ga4_propriedade || st.gsc_site || st.dominios.length);
            return (
              <article key={st.id} className="panel crm-site spotlight" data-ativo={st.ativo} data-enter="scale">
                <header className="crm-site-topo">
                  <span className="wa-avatar">{api ? <Plug size={18} aria-hidden /> : <Globe size={18} aria-hidden />}</span>
                  <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <b className="crm-trunc">{st.nome}</b>
                    <span className="subtle caption crm-trunc">{st.dominios.length ? st.dominios.join(", ") : api ? "sem domínio" : "qualquer domínio (preencha!)"}</span>
                  </span>
                  <span className="chip" style={{ height: 24, flex: "none" }}><span className={`dot ${st.ativo ? "on" : ""}`} aria-hidden />{st.ativo ? "Ativo" : "Pausado"}</span>
                </header>
                <div className="crm-site-nums">
                  <span><b>{st.leads}</b><small>lead(s)</small></span>
                  <span suppressHydrationWarning><b>{st.ultimo_lead ? ha(st.ultimo_lead).replace("há ", "") : "—"}</b><small>último lead</small></span>
                </div>
                <div className="crm-site-fontes">
                  <span className="crm-site-fonte" data-on={api}><Plug size={13} aria-hidden /> {api ? "Leads pela API" : "Formulário"}</span>
                  <span className="crm-site-fonte" data-on={!!st.ga4_propriedade} title={st.ga4_propriedade ? `Propriedade ${st.ga4_propriedade}` : "Sem GA4: cadastre o ID ao editar"}>
                    <GoogleAnalyticsLogo size={13} /> {st.ga4_propriedade ? "Analytics" : "Sem Analytics"}
                  </span>
                  <span className="crm-site-fonte" data-on={!!(st.gsc_site || st.dominios.length)} title={st.gsc_site ?? (st.dominios.length ? "Achado sozinho pelo domínio" : "Cadastre o domínio")}>
                    <SearchConsoleLogo size={13} /> {st.gsc_site ? "Search Console" : st.dominios.length ? "Search Console · auto" : "Sem Search Console"}
                  </span>
                </div>
                {!api && <p className="crm-site-msg">“{preencherModelo(st.mensagem_inicial, { nome: "Maria Souza", numero: "", site: st.nome })}”</p>}
                <footer className="crm-site-acoes">
                  {stats && <Link className="btn btn-primary btn-xs" href={`/crm/sites/${st.id}`}><BarChart3 aria-hidden /> Estatísticas</Link>}
                  {!api && <button className="btn btn-secondary btn-xs" onClick={() => setCodigo(st)}><Code2 aria-hidden /> Código</button>}
                  <span className="crm-site-icones">
                    <button className="btn btn-ghost btn-xs" title={st.ativo ? "Pausar: para de aceitar leads" : "Reativar"} aria-label={st.ativo ? `Pausar ${st.nome}` : `Ativar ${st.nome}`} onClick={async () => {
                      const r = await alternarSite(st.id, !st.ativo);
                      if (!r.ok) toast.err(r.error); else router.refresh();
                    }}>{st.ativo ? <Pause aria-hidden /> : <Play aria-hidden />}</button>
                    <button className="btn btn-ghost btn-xs" title="Editar" aria-label={`Editar ${st.nome}`} onClick={() => setEdit({ id: st.id, nome: st.nome, dominios: st.dominios.join(", "), mensagem_inicial: st.mensagem_inicial, ga4: st.ga4_propriedade ?? "", gsc: st.gsc_site ?? "" })}><Pencil aria-hidden /></button>
                    <button className="btn btn-ghost btn-xs" title="Apagar" aria-label={`Apagar ${st.nome}`} onClick={async () => {
                      if (!(await confirmar(`Apagar o site “${st.nome}”? ${api ? "O sistema para de conseguir mandar leads" : "O formulário dele para de funcionar"}; os leads que já chegaram continuam no CRM.`))) return;
                      const r = await apagarSite(st.id);
                      if (!r.ok) toast.err(r.error); else router.refresh();
                    }}><Trash2 aria-hidden /></button>
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel wa-vazio" style={{ padding: "48px 16px" }}>
          <Globe size={38} aria-hidden /><b>Nenhum site conectado</b>
          <span className="subtle small" style={{ textAlign: "center", maxWidth: 440 }}>Conecte um site, copie o formulário e cole no HTML. Cada pessoa que preencher vira um lead, com a página e o anúncio de onde veio.</span>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={novo}><Plus aria-hidden /> Conectar site</button>
        </div>
      )}

      {edit && <EditarSite inicial={edit} fechar={() => setEdit(null)} criado={(st) => { setEdit(null); if (st) setCodigo(st); router.refresh(); }} />}
      <CodigoDialog site={codigo} fechar={() => setCodigo(null)} />
    </div>
  );
}

function EditarSite({ inicial, fechar, criado }: { inicial: Edicao; fechar: () => void; criado: (st: SiteLead | null) => void }) {
  const [edit, setEdit] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const mudar = (p: Partial<Edicao>) => { setEdit({ ...edit, ...p }); setErro(null); };
  const salvar = () => start(async () => {
    const v = leadSiteSchema.safeParse(edit);
    if (!v.success) return setErro(v.error.issues[0]?.message ?? "Dados inválidos");
    const r = await salvarSite(edit.id, edit);
    if (!r.ok) return setErro(r.error);
    toast.ok(edit.id ? "Site salvo" : "Site conectado: agora copie o código do formulário");
    criado(r.data ? { id: "", nome: edit.nome, chave: r.data, dominios: [], mensagem_inicial: edit.mensagem_inicial, ativo: true, ultimo_lead: null, leads: 0, ga4_propriedade: null, gsc_site: null } : null);
  });
  return (
    <Dialog open onClose={fechar} title={edit.id ? "Editar site" : "Conectar site"}>
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="field">
          <label className="label" htmlFor="st-nome">Nome do site *</label>
          <input id="st-nome" className="input" value={edit.nome} maxLength={60} autoFocus onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Castilho Advogados" />
        </div>
        <div className="field">
          <label className="label" htmlFor="st-dom">Domínios que podem mandar</label>
          <input id="st-dom" className="input" value={edit.dominios} onChange={(e) => mudar({ dominios: e.target.value })} placeholder="castilho.adv.br, outro-dominio.com" />
          <span className="subtle caption">Subdomínios valem (www.). Vazio = qualquer site pode usar: preencha assim que o site estiver no ar.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="st-msg">Mensagem que o lead manda ao abrir o WhatsApp *</label>
          <textarea id="st-msg" className="input" rows={3} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={500}
            value={edit.mensagem_inicial} onChange={(e) => mudar({ mensagem_inicial: e.target.value })} />
          <span className="subtle caption">Aceita {"{nome}"}, {"{primeiro_nome}"} e {"{site}"}. A pessoa ainda pode mudar antes de mandar.</span>
        </div>
        {edit.mensagem_inicial.trim() && (
          <div className="wa-previa-modelo"><span className="subtle caption">Prévia com “Maria Souza”:</span>
            <p>{preencherModelo(edit.mensagem_inicial, { nome: "Maria Souza", numero: "5531999999999", site: edit.nome || "seu site" })}</p></div>
        )}
        <div className="cluster" style={{ gap: 12, alignItems: "flex-start" }}>
          <div className="field" style={{ flex: "1 1 180px" }}>
            <label className="label" htmlFor="st-ga4">ID da propriedade do GA4</label>
            <input id="st-ga4" className="input" inputMode="numeric" value={edit.ga4} maxLength={15} onChange={(e) => mudar({ ga4: e.target.value })} placeholder="Ex.: 412345678" />
            <span className="subtle caption">GA4 → Administrador → Detalhes da propriedade.</span>
          </div>
          <GscCampo valor={edit.gsc} mudar={(gsc) => mudar({ gsc })} />
        </div>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : edit.id ? "Salvar" : "Conectar site"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Search Console em 2 partes: o tipo da propriedade (como aparece no seletor dele) e o endereço.
 * Domínio "digitaldomus.com.br" vira "sc-domain:digitaldomus.com.br"; prefixo de URL ganha a "/" do fim.
 */
function GscCampo({ valor, mudar }: { valor: string; mudar: (v: string) => void }) {
  const [tipo, setTipo] = useState<"dominio" | "url">(/^https?:/i.test(valor) ? "url" : "dominio");
  const texto = tipo === "dominio" ? valor.replace(/^sc-domain:/, "") : valor;
  const montar = (t: "dominio" | "url", v: string) => {
    const s = v.trim();
    if (!s) return "";
    if (t === "dominio") return `sc-domain:${s.replace(/^sc-domain:/, "").replace(/^https?:\/\//i, "").replace(/[/?#].*$/, "").toLowerCase()}`;
    const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    return u.endsWith("/") ? u : `${u}/`;
  };
  return (
    <div className="field" style={{ flex: "1 1 260px" }}>
      <label className="label" htmlFor="st-gsc">Site no Search Console <span className="subtle">(opcional)</span></label>
      <div className="cluster" style={{ gap: 6, flexWrap: "nowrap" }}>
        <Seletor ariaLabel="Tipo da propriedade no Search Console" valor={tipo} style={{ flex: "none", height: 36 }}
          onChange={(x) => { const t = x as "dominio" | "url"; setTipo(t); mudar(montar(t, texto)); }}
          opcoes={[{ valor: "dominio", rotulo: "Domínio" }, { valor: "url", rotulo: "Prefixo de URL" }]} />
        <input id="st-gsc" className="input" style={{ minWidth: 0 }} value={texto} maxLength={200} onChange={(e) => mudar(e.target.value ? (tipo === "dominio" ? `sc-domain:${e.target.value}` : e.target.value) : "")}
          onBlur={() => mudar(montar(tipo, texto))} placeholder={tipo === "dominio" ? "seusite.com.br" : "https://www.seusite.com.br/"} />
      </div>
      <span className="subtle caption">Vazio = acha sozinho pelo domínio do site (subdomínio cai na propriedade do domínio principal, só com as páginas dele).</span>
    </div>
  );
}

const PASSOS_GOOGLE: { t: string; d: string; links: [string, string][] }[] = [
  { t: "Ative as 2 APIs", d: "No projeto do Google Cloud, clique em Ativar em cada uma.", links: [
    ["Analytics Data API", "https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"],
    ["Search Console API", "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"]] },
  { t: "Crie a conta de serviço", d: "Só o nome (ex.: adpilot-estatisticas). Pule a etapa de papéis e conclua.", links: [["Criar conta de serviço", "https://console.cloud.google.com/iam-admin/serviceaccounts/create"]] },
  { t: "Baixe a chave JSON", d: "Na conta criada: aba Chaves → Adicionar chave → Criar nova chave → JSON.", links: [["Contas de serviço", "https://console.cloud.google.com/iam-admin/serviceaccounts"]] },
  { t: "Dê acesso nos sites", d: "Com o e-mail da conta: Leitor no GA4 (Gerenciamento de acesso) e Restrito no Search Console (Usuários e permissões).", links: [
    ["Google Analytics", "https://analytics.google.com/analytics/web/"], ["Search Console", "https://search.google.com/search-console/users"]] },
];

/** Conta de serviço do Google: uma chave lê o GA4 e o Search Console de todos os sites que derem acesso ao e-mail dela (só leitura). */
function ContaGoogle({ email }: { email: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(!email);
  const [json, setJson] = useState("");
  const [colar, setColar] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [pend, start] = useTransition();
  const lida = (() => {
    if (!json.trim()) return null;
    try {
      const j = JSON.parse(json) as { type?: string; client_email?: string; private_key?: string; project_id?: string };
      return j.type === "service_account" && j.client_email && j.private_key ? { email: j.client_email, projeto: j.project_id ?? "" } : { erro: "Não é a chave JSON de uma conta de serviço" };
    } catch { return { erro: "JSON incompleto: copie o arquivo inteiro" }; }
  })();
  const arquivo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20_000) return void toast.err("Arquivo grande demais para ser a chave");
    setJson(await f.text());
  };
  const salvar = (v: string | null) => start(async () => {
    const r = await salvarContaGoogle(v);
    if (!r.ok) return void toast.err(r.error);
    setJson(""); setColar(false); setAberto(false);
    toast.ok(v ? "Conta Google validada e salva" : "Conta Google removida");
    router.refresh();
  });

  return (
    <section className="panel gc" data-enter>
      <div className="gc-topo">
        <span className="gc-logos"><span><GoogleAnalyticsLogo size={22} /></span><span><SearchConsoleLogo size={22} /></span></span>
        <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
          <b className="gc-titulo">Google Analytics e Search Console</b>
          <span className="subtle small">Visitas e buscas de cada site, só leitura, por uma conta de serviço do Google.</span>
        </span>
        <span className="chip" style={{ height: 26, flex: "none" }}><span className={`dot ${email ? "on" : ""}`} aria-hidden />{email ? "Conectado" : "Não conectado"}</span>
      </div>

      {email && (
        <div className="gc-email">
          <KeyRound size={16} aria-hidden />
          <span className="stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <span className="subtle caption">E-mail da conta: dê acesso a ele em cada site (Leitor no GA4, Restrito no Search Console)</span>
            <code className="crm-trunc">{email}</code>
          </span>
          <button className="btn btn-secondary btn-xs" onClick={async () => { await navigator.clipboard.writeText(email); toast.ok("E-mail copiado"); }}><Copy aria-hidden /> Copiar</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setAberto((a) => !a)}>{aberto ? "Fechar" : "Trocar chave"}</button>
          <button className="btn btn-ghost btn-xs" disabled={pend} aria-label="Remover conta Google" title="Remover" onClick={async () => { if (await confirmar("Remover a conta Google? As estatísticas dos sites param de carregar.")) salvar(null); }}><Trash2 aria-hidden /></button>
        </div>
      )}

      {aberto && (
        <div className="gc-corpo">
          <ol className="gc-passos">
            {PASSOS_GOOGLE.map((p, i) => (
              <li key={p.t}>
                <span className="gc-n">{i + 1}</span>
                <b>{p.t}</b>
                <span className="subtle caption">{p.d}</span>
                <span className="gc-links">{p.links.map(([l, h]) => <a key={h} href={h} target="_blank" rel="noreferrer">{l} <ExternalLink size={11} aria-hidden /></a>)}</span>
              </li>
            ))}
          </ol>

          {lida && "email" in lida ? (
            <div className="gc-pronta">
              <span className="gc-pronta-ic"><FileJson size={20} aria-hidden /></span>
              <span className="stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
                <b>Chave pronta{lida.projeto ? ` · projeto ${lida.projeto}` : ""}</b>
                <code className="subtle caption crm-trunc">{lida.email}</code>
              </span>
              <button className="btn btn-ghost btn-xs" onClick={() => setJson("")}>Trocar</button>
              <button className="btn btn-primary btn-sm" disabled={pend} onClick={() => salvar(json)}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <><ShieldCheck aria-hidden /> Validar e salvar</>}</button>
            </div>
          ) : colar ? (
            <div className="stack" style={{ gap: 8 }}>
              <textarea className="input gc-colar" rows={5} spellCheck={false} autoComplete="off" autoFocus
                placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }' aria-label="Conteúdo da chave JSON" value={json} onChange={(e) => setJson(e.target.value)} />
              <div className="cluster" style={{ justifyContent: "space-between" }}>
                {lida && "erro" in lida ? <span className="error-text small">{lida.erro}</span> : <span />}
                <button className="btn btn-ghost btn-xs" onClick={() => { setColar(false); setJson(""); }}>Enviar o arquivo</button>
              </div>
            </div>
          ) : (
            <label className="gc-drop" data-arrastando={arrastando}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); void arquivo(e.dataTransfer.files[0]); }}>
              <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void arquivo(e.target.files?.[0])} />
              <Upload size={22} aria-hidden />
              <b>Arraste o arquivo .json da chave aqui</b>
              <span className="subtle caption">ou clique para escolher · <button type="button" className="gc-link" onClick={(e) => { e.preventDefault(); setColar(true); }}>colar o conteúdo</button></span>
              <span className="subtle caption"><ShieldCheck size={12} aria-hidden style={{ verticalAlign: -2 }} /> Fica cifrada no banco e nunca volta para a tela.</span>
            </label>
          )}
        </div>
      )}
    </section>
  );
}

function CodigoDialog({ site, fechar }: { site: SiteLead | null; fechar: () => void }) {
  const html = site ? codigoFormulario(window.location.origin, site.chave) : "";
  return (
    <Dialog open={!!site} onClose={fechar} title={site ? `Formulário · ${site.nome}` : ""} largo>
      <div className="stack" style={{ gap: 12 }}>
        <p className="subtle small" style={{ margin: 0 }}>
          Cole no HTML do site, onde o formulário deve aparecer. Quem preencher entra em <b>Leads</b>, você recebe um aviso no WhatsApp,
          e o WhatsApp da pessoa abre com a mensagem pronta para <b>ela</b> começar a conversa (o que menos dá ban).
        </p>
        <pre className="wa-codigo"><code>{html}</code></pre>
        <span className="subtle caption"><ShieldCheck size={12} aria-hidden style={{ verticalAlign: -2 }} /> A cor do botão muda em <code>--cor</code>. Sem JavaScript o formulário também funciona (vai direto para o WhatsApp).</span>
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={fechar}>Fechar</button>
          <button className="btn btn-primary btn-sm" onClick={async () => { await navigator.clipboard.writeText(html); toast.ok("Código copiado"); }}><Copy aria-hidden /> Copiar código</button>
        </div>
      </div>
    </Dialog>
  );
}
