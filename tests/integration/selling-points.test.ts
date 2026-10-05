import { afterEach, describe, expect, it } from "vitest";
import { getVehicleById, rowToVehicle } from "../../lib/db";
import type { Vehicle } from "../../lib/types";
import { validVehicle } from "../../src/api-contracts";
import { handleRequest } from "../../workers/app";
import type { Env } from "../../workers/env";
import { SqliteD1 } from "../helpers/sqlite-d1";

const origin = "http://localhost:5173";
const headers = { Origin: origin, "Content-Type": "application/json" };
const databases: SqliteD1[] = [];
const sellingPoints = [
  { zh: "低首付", en: "Low down payment" },
  { zh: "低里程", en: "Low mileage" },
];
const vehicleInput = {
  title: "2022 Toyota RAV4 XLE",
  status: "available",
  featured: true,
  priceCents: 2_699_000,
  mileage: 28_000,
};

function setup() {
  const db = new SqliteD1();
  databases.push(db);
  const env: Env = {
    DB: db,
    APP_ORIGIN: origin,
    DEV_ADMIN_EMAIL: "admin@example.com",
    ADMIN_EMAILS: "admin@example.com",
  };
  const write = (
    path: string,
    body: unknown,
    method = "POST",
    useEnv = env,
    requestOrigin = origin,
  ) =>
    handleRequest(
      new Request(`${origin}${path}`, {
        method,
        headers: { ...headers, Origin: requestOrigin },
        body: JSON.stringify(body),
      }),
      useEnv,
    );
  const create = async (points: unknown = sellingPoints) => {
    const response = await write("/api/admin/vehicles", {
      ...vehicleInput,
      sellingPoints: points,
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { id: string }).id;
  };
  return { db, env, write, create };
}

afterEach(() => {
  for (const db of databases.splice(0)) db.sqlite.close();
});

describe("Vehicle selling points", () => {
  it("stores normalized tags and returns them in public and admin vehicle responses", async () => {
    const { db, env, create } = setup();
    const id = await create([
      { zh: " 低首付 ", en: " Low down payment " },
      sellingPoints[1],
    ]);
    const vehicle = (await getVehicleById(db, id, true))!;
    expect(vehicle.sellingPoints).toEqual(sellingPoints);
    expect(
      await db
        .prepare("SELECT selling_points_json FROM vehicles WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ selling_points_json: JSON.stringify(sellingPoints) });

    for (const path of [
      "/api/inventory",
      "/api/admin/vehicles",
      "/api/admin/dashboard",
    ]) {
      const response = await handleRequest(
        new Request(`${origin}${path}`),
        env,
      );
      expect(response.status).toBe(200);
      const result = (await response.json()) as { vehicles: Vehicle[] };
      expect(
        result.vehicles.find((item) => item.id === id)?.sellingPoints,
      ).toEqual(sellingPoints);
    }
    for (const path of [
      `/api/vehicles/${vehicle.slug}`,
      `/api/admin/vehicles/${id}`,
    ]) {
      const response = await handleRequest(
        new Request(`${origin}${path}`),
        env,
      );
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { vehicle: Vehicle }).vehicle.sellingPoints,
      ).toEqual(sellingPoints);
    }
    const home = await handleRequest(
      new Request(`${origin}/api/public/home`),
      env,
    );
    expect(
      ((await home.json()) as { featured: Vehicle[] }).featured[0]
        .sellingPoints,
    ).toEqual(sellingPoints);
  });

  it("preserves existing tags for legacy editors and clears only an explicit empty array", async () => {
    const { db, create, write } = setup();
    const id = await create();
    for (const method of ["PUT", "PATCH"]) {
      const response = await write(
        `/api/admin/vehicles/${id}`,
        { ...vehicleInput, title: `${vehicleInput.title} updated` },
        method,
      );
      expect(response.status).toBe(200);
      expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual(
        sellingPoints,
      );
    }
    expect(
      (
        await write(
          `/api/admin/vehicles/${id}`,
          {
            ...vehicleInput,
            sellingPoints: [],
          },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual([]);
  });

  it("keeps tags through reserved, sold, and available status changes", async () => {
    const { db, create, write } = setup();
    const id = await create();
    for (const status of ["pending", "sold", "available"]) {
      const response = await write(`/api/admin/vehicles/${id}/status`, {
        status,
      });
      expect(response.status).toBe(200);
      expect(await getVehicleById(db, id, true)).toMatchObject({
        status,
        sellingPoints,
      });
    }
  });

  it("defaults new and legacy rows to no tags and tolerates missing or corrupt stored data", async () => {
    const { db, write } = setup();
    const response = await write("/api/admin/vehicles", vehicleInput);
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual([]);
    await db
      .prepare(
        "INSERT INTO vehicles (id,slug,status,title,created_at,updated_at) VALUES ('legacy','legacy','draft','Legacy','2026-10-05','2026-10-05')",
      )
      .run();
    expect((await getVehicleById(db, "legacy", true))?.sellingPoints).toEqual(
      [],
    );
    for (const corrupt of ["not-json", "null", "{}", '[{"zh":"","en":""}]']) {
      await db
        .prepare("UPDATE vehicles SET selling_points_json=? WHERE id=?")
        .bind(corrupt, id)
        .run();
      expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual([]);
    }
    expect(
      rowToVehicle({ id, slug: "old", status: "available" }).sellingPoints,
    ).toEqual([]);
  });

  it("normalizes missing translations and keeps label content as plain text", async () => {
    const { db, create } = setup();
    const id = await create([{ zh: "低里程" }, { en: "<b>Special</b>" }]);
    expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual([
      { zh: "低里程", en: "" },
      { zh: "", en: "<b>Special</b>" },
    ]);
  });

  it.each([
    {
      name: "too many tags",
      value: [...sellingPoints, { zh: "新到店", en: "New arrival" }],
    },
    { name: "blank tag", value: [{ zh: "  ", en: " " }] },
    { name: "empty object", value: [{}] },
    { name: "long Chinese label", value: [{ zh: "好".repeat(13) }] },
    { name: "long English label", value: [{ en: "x".repeat(29) }] },
    {
      name: "repeated Chinese label",
      value: [{ zh: "低里程" }, { zh: " 低里程 ", en: "Another" }],
    },
    {
      name: "case-insensitive repeated English label",
      value: [{ en: "Low mileage" }, { en: " LOW MILEAGE " }],
    },
    { name: "null collection", value: null },
    { name: "non-string label", value: [{ zh: 123 }] },
    { name: "string collection", value: "低里程" },
  ])("rejects $name without modifying inventory", async ({ value }) => {
    const { db, create, write } = setup();
    const id = await create();
    const payload = { ...vehicleInput, sellingPoints: value };
    expect((await write("/api/admin/vehicles", payload)).status).toBe(400);
    expect(
      (await write(`/api/admin/vehicles/${id}`, payload, "PUT")).status,
    ).toBe(400);
    expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual(
      sellingPoints,
    );
    expect(
      await db.prepare("SELECT COUNT(*) AS count FROM vehicles").first(),
    ).toEqual({ count: 1 });
  });

  it("rejects unauthenticated and cross-origin writes before changing tags", async () => {
    const { db, env, create, write } = setup();
    const id = await create();
    const payload = { ...vehicleInput, sellingPoints: [] };
    expect(
      (
        await write(`/api/admin/vehicles/${id}`, payload, "PUT", {
          ...env,
          DEV_ADMIN_EMAIL: undefined,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await write(
          `/api/admin/vehicles/${id}`,
          payload,
          "PUT",
          env,
          "https://untrusted.example",
        )
      ).status,
    ).toBe(403);
    expect((await getVehicleById(db, id, true))?.sellingPoints).toEqual(
      sellingPoints,
    );
  });

  it("accepts legacy vehicle responses but rejects malformed selling points", async () => {
    const { db, create } = setup();
    const id = await create();
    const vehicle = (await getVehicleById(db, id, true))!;
    expect(validVehicle(vehicle)).toBe(true);
    delete vehicle.sellingPoints;
    expect(validVehicle(vehicle)).toBe(true);
    expect(validVehicle({ ...vehicle, sellingPoints: "Low mileage" })).toBe(
      false,
    );
    expect(
      validVehicle({ ...vehicle, sellingPoints: [{ zh: "", en: "" }] }),
    ).toBe(false);
  });
});
