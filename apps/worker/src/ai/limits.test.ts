import { expect, test } from "vitest";
import { blockedUntil, isAuthText, isLimitText, usageFromClaude, usageFromCodex } from "./limits";

test("detecta limite e login nas mensagens dos CLIs", () => {
  expect(isLimitText("Claude usage limit reached. Your limit will reset at 3pm")).toBe(true);
  expect(isLimitText("You've hit your usage limit.")).toBe(true);
  expect(isLimitText("tudo certo")).toBe(false);
  expect(isAuthText("Invalid API key · Please run /login")).toBe(true);
});

test("lê uso do stream do Claude e do rollout do Codex", () => {
  const c = usageFromClaude({ rate_limit_info: { status: "rejected", resetsAt: 1791441600, unifiedWindows: { five_hour: { utilization: 1, resetsAt: 1791441600 }, seven_day: { utilization: 0.54, resetsAt: 1791424800 } } } });
  expect(c?.rejected).toBe(true);
  expect(c?.usage.five_hour?.pct).toBe(100);
  expect(c?.usage.seven_day?.pct).toBe(54);
  const x = usageFromCodex({ primary: { used_percent: 2, window_minutes: 300, resets_at: 1791438604 }, secondary: { used_percent: 4, window_minutes: 10080, resets_at: 1792004099 } });
  expect(x?.five_hour?.pct).toBe(2);
  expect(usageFromCodex({ primary: { used_percent: 2, window_minutes: 60 } })).toBeNull();
});

test("bloqueio vai até o reset da janela que esgotou (o mais distante), ou 5 h", () => {
  const now = Date.UTC(2026, 9, 7, 12);
  const h = (n: number) => new Date(now + n * 3600_000).toISOString();
  const ambas = { five_hour: { pct: 100, resets_at: h(2) }, seven_day: { pct: 100, resets_at: h(48) }, observed_at: h(0), source: "t" };
  expect(blockedUntil(ambas, null, now).toISOString()).toBe(h(48));
  expect(blockedUntil(null, h(3), now).toISOString()).toBe(h(3));
  expect(blockedUntil(null, null, now).toISOString()).toBe(h(5));
});
