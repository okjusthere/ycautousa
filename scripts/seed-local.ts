#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const rows = [
  [
    "local-rav4",
    "2022-toyota-rav4-xle-local",
    "2022 Toyota RAV4 XLE",
    2022,
    "Toyota",
    "RAV4",
    2699000,
    28412,
    "Lunar Rock",
    "SUV",
    "AWD",
  ],
  [
    "local-accord",
    "2021-honda-accord-sport-local",
    "2021 Honda Accord Sport",
    2021,
    "Honda",
    "Accord",
    2299000,
    36105,
    "Platinum White",
    "Sedan",
    "FWD",
  ],
  [
    "local-glc",
    "2020-mercedes-benz-glc-300-local",
    "2020 Mercedes-Benz GLC 300",
    2020,
    "Mercedes-Benz",
    "GLC 300",
    3199000,
    44210,
    "Obsidian Black",
    "SUV",
    "4MATIC",
  ],
];
const quote = (value: unknown) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${String(value).replace(/'/g, "''")}'`;
const statements =
  rows
    .map(
      (
        [
          id,
          slug,
          title,
          year,
          make,
          model,
          price,
          mileage,
          color,
          body,
          drive,
        ],
        index,
      ) =>
        `INSERT INTO vehicles (id,slug,status,featured,title,year,make,model,price_cents,mileage,exterior_color,body_type,drivetrain,transmission,fuel_type,engine,description,features_json,created_at,updated_at,published_at) VALUES (${quote(id)},${quote(slug)},'available',${index === 0 ? 1 : 0},${quote(title)},${year},${quote(make)},${quote(model)},${price},${mileage},${quote(color)},${quote(body)},${quote(drive)},'Automatic','Gasoline','2.5L 4-cyl','Local development sample — replace with real inventory.','["Backup camera","Bluetooth","Keyless entry"]',datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status='available',updated_at=datetime('now');`,
    )
    .join("\n") +
  "\nINSERT INTO legacy_redirects (old_path,target_path,status_code,created_at) VALUES ('/legacy-demo-p.html','/inventory/2022-toyota-rav4-xle-local',301,datetime('now')) ON CONFLICT(old_path) DO UPDATE SET target_path=excluded.target_path;";
try {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "yc-auto-prod",
      "--local",
      "--command",
      statements,
    ],
    { cwd: root, stdio: "inherit" },
  );
  console.log(
    "Local development inventory seeded. This script never runs in production.",
  );
} catch {
  console.error("Unable to seed local D1. Run npm run db:migrate:local first.");
  process.exitCode = 1;
}
