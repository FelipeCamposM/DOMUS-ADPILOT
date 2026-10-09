import { expect, test } from "vitest";
import { _test, lerPagina } from "./contexto";

test("bloqueia endereços da rede local (SSRF)", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.20.3.4", "169.254.169.254", "100.100.1.1", "0.0.0.0", "::1", "fd00::1", "::ffff:192.168.0.1"])
    expect(_test.privado(ip), ip).toBe(true);
  for (const ip of ["8.8.8.8", "104.16.0.1", "2606:4700::1"]) expect(_test.privado(ip), ip).toBe(false);
});

test("recusa link para localhost e protocolo que não é http", async () => {
  await expect(lerPagina("http://localhost:3200/")).rejects.toThrow(/rede local/);
  await expect(lerPagina("http://127.0.0.1/")).rejects.toThrow(/rede local/);
  await expect(lerPagina("file:///C:/Windows/win.ini")).rejects.toThrow(/http/);
});
