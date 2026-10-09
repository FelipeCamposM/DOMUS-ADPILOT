import { expect, test } from "vitest";
import { parseActionBlocks } from "./ai-actions";

const id = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

test("extrai só ações da allowlist", () => {
  const text = [
    "Sugiro:",
    "```domus-action",
    JSON.stringify([{ type: "UPDATE_BUDGET", campaignId: id, dailyBudget: "130,00" }, { type: "DELETE_ACCOUNT", campaignId: id }]),
    "```",
    "```domus-action\n{\"type\":\"PAUSE_CAMPAIGN\",\"campaignId\":\"" + id + "\"}\n```",
    "```domus-action\nnão é json\n```",
  ].join("\n");
  const r = parseActionBlocks(text);
  expect(r.actions.map((a) => a.type)).toEqual(["UPDATE_BUDGET", "PAUSE_CAMPAIGN"]);
  expect(r.invalid).toBe(2);
});
