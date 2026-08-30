import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { D1Like, D1Statement, D1Result } from "../../lib/db";

type Statement = ReturnType<DatabaseSync["prepare"]>;

export class SqliteD1 implements D1Like {
  readonly sqlite: DatabaseSync;
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    const migration = readFileSync(
      resolve(
        new URL("../../migrations/0001_initial.sql", import.meta.url).pathname,
      ),
      "utf8",
    );
    this.sqlite.exec(migration);
  }
  prepare(sql: string): D1Statement {
    let statement: Statement | null = null;
    let args: unknown[] = [];
    const ensure = () => {
      statement ??= this.sqlite.prepare(sql);
      return statement;
    };
    return {
      bind: (...values: unknown[]) => {
        args = values;
        return this.prepareBound(ensure(), args);
      },
      first: async <T>() => {
        const row = (ensure().get as (...values: any[]) => unknown)(...args) as
          T | undefined;
        return row ?? null;
      },
      all: async <T>() =>
        ({
          results: (ensure().all as (...values: any[]) => unknown[])(
            ...args,
          ) as unknown as T[],
        }) as D1Result<T>,
      run: async () => {
        const result = (
          ensure().run as (...values: any[]) => { changes: number }
        )(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }
  private prepareBound(statement: Statement, args: unknown[]): D1Statement {
    return {
      bind: (...values: unknown[]) => this.prepareBound(statement, values),
      first: async <T>() => {
        const row = (statement.get as (...values: any[]) => unknown)(
          ...args,
        ) as T | undefined;
        return row ?? null;
      },
      all: async <T>() =>
        ({
          results: (statement.all as (...values: any[]) => unknown[])(
            ...args,
          ) as unknown as T[],
        }) as D1Result<T>,
      run: async () => {
        const result = (
          statement.run as (...values: any[]) => { changes: number }
        )(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }
  async batch(statements: D1Statement[]): Promise<unknown> {
    for (const statement of statements) await statement.run();
    return [];
  }
}
