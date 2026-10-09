import { expect, test } from "vitest";
import { fromMicros, fromMinor, toDecimal, toMicros, toMinor } from "./money";

test("conversões de dinheiro sem float", () => {
  expect(fromMinor("13000")).toBe("130.00");
  expect(fromMinor(5)).toBe("0.05");
  expect(toMinor("130")).toBe(13000n);
  expect(toMinor("0,5")).toBe(50n);
  expect(fromMicros("70000000")).toBe("70.00");
  expect(fromMicros("1234567")).toBe("1.23");
  expect(toMicros("70.25")).toBe(70250000n);
  expect(toDecimal(" 007,5 ")).toBe("7.50");
  expect(() => toDecimal("1.234,56")).toThrow();
  expect(() => toDecimal("-1")).toThrow();
});
