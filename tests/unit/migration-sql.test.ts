import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("generated migration artifacts", () => {
  it("are repeatable and preserve stable vehicle/redirect/image counts", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        resolve(
          new URL("../../migrations/0001_initial.sql", import.meta.url)
            .pathname,
        ),
        "utf8",
      ),
    );
    const sql = readFileSync(
      resolve(
        new URL("../../migration/output/migration.sql", import.meta.url)
          .pathname,
      ),
      "utf8",
    );
    db.exec(sql);
    db.exec(sql);
    const count = (table: string) =>
      Number(
        (
          db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
            count: number;
          }
        ).count,
      );
    expect(count("vehicles")).toBeGreaterThan(0);
    expect(count("legacy_redirects")).toBe(count("vehicles"));
    expect(count("vehicle_images")).toBeGreaterThan(0);
  });
});
