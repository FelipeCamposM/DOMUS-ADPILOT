/** E-mail pela Resend (domínio digitaldomus.com.br verificado). Para: ADMIN_EMAILS. Nunca lança. */
export async function emailAdmins(assunto: string, html: string) {
  const para = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const chave = process.env.RESEND_API_KEY;
  if (!chave || !para.length) return console.log("e-mail não enviado: RESEND_API_KEY ou ADMIN_EMAILS vazio");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "DOMUS AdPilot <avisos@digitaldomus.com.br>", to: para, subject: assunto, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.log(`e-mail não enviado: Resend ${r.status} ${await r.text().catch(() => "")}`);
  } catch (e) {
    console.log(`e-mail não enviado: ${(e as Error).message}`);
  }
}
