/** Frases com que Claude Code e Codex avisam que a conta bateu o limite (mesma lista do OMNI Agents). */
const LIMIT_TEXT = [/usage limit reached/i, /hit your usage limit/i, /5-hour limit reached/i, /weekly limit reached/i, /limit reached.*resets?/i, /rate_limit_error/i];
const AUTH_TEXT = [/please run \/login/i, /not logged in/i, /invalid api key/i, /authentication_error/i, /oauth token has expired/i, /401 unauthorized/i];

export const isLimitText = (s: string) => LIMIT_TEXT.some((r) => r.test(s));
export const isAuthText = (s: string) => AUTH_TEXT.some((r) => r.test(s));

export interface UsageWindow { pct: number; resets_at: string | null }
export interface Usage { five_hour?: UsageWindow; seven_day?: UsageWindow; observed_at: string; source: string }

const iso = (epochS: unknown) => (typeof epochS === "number" && epochS > 0 ? new Date(epochS * 1000).toISOString() : null);

/** Claude: evento `rate_limit_event` do stream-json (utilization 0–1, resetsAt em segundos). */
export function usageFromClaude(ev: Record<string, unknown>): { usage: Usage; rejected: boolean; resetsAt: string | null } | null {
  const info = ev.rate_limit_info as Record<string, unknown> | undefined;
  if (!info) return null;
  const w = (info.unifiedWindows ?? {}) as Record<string, { utilization?: number; resetsAt?: number } | undefined>;
  const win = (x?: { utilization?: number; resetsAt?: number }) =>
    x && typeof x.utilization === "number" ? { pct: Math.round(x.utilization * 1000) / 10, resets_at: iso(x.resetsAt) } : undefined;
  return {
    usage: { five_hour: win(w.five_hour), seven_day: win(w.seven_day), observed_at: new Date().toISOString(), source: "claude_stream" },
    rejected: info.status === "rejected",
    resetsAt: iso(info.resetsAt),
  };
}

/** Codex: `rate_limits` do último token_count do rollout (used_percent 0–100, resets_at em segundos). */
export function usageFromCodex(rl: Record<string, unknown>): Usage | null {
  const win = (x: unknown, minutes: number) => {
    const o = x as { used_percent?: number; resets_at?: number; window_minutes?: number } | undefined;
    return o && typeof o.used_percent === "number" && o.window_minutes === minutes ? { pct: o.used_percent, resets_at: iso(o.resets_at) } : undefined;
  };
  const u = { five_hour: win(rl.primary, 300), seven_day: win(rl.secondary, 10080), observed_at: new Date().toISOString(), source: "codex_rollout" };
  return u.five_hour || u.seven_day ? u : null;
}

/**
 * Até quando a conta fica fora do rodízio: o reset da janela que esgotou; se as duas estão em 100%, o mais distante;
 * sem reset legível, 5 horas (mesma regra do OMNI).
 */
export function blockedUntil(usage: Usage | null, resetsAt: string | null, now = Date.now()): Date {
  const cheias = [usage?.five_hour, usage?.seven_day].filter((w) => w && w.pct >= 100 && w.resets_at).map((w) => new Date(w!.resets_at!).getTime());
  const candidatos = [...cheias, resetsAt ? new Date(resetsAt).getTime() : NaN].filter((t) => Number.isFinite(t) && t > now);
  return new Date(candidatos.length ? Math.max(...candidatos) : now + 5 * 3600_000);
}
