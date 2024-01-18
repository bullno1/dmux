import { TSchema, TypeCheck, TypeCompiler } from "../deps/typebox.ts";

export type SchemaTable<T extends TSchema = TSchema> = {
  [key: string]: T;
};

export type CheckerTable<T extends SchemaTable> = {
  [key in keyof T]: TypeCheck<T[key]>;
};

export function makeChecker<
  T extends SchemaTable,
>(schemaTable: T): CheckerTable<T> {
  return Object.fromEntries(
    Object.entries(schemaTable).map((
      [key, value],
    ) => [key, TypeCompiler.Compile(value)]),
  ) as CheckerTable<T>;
}
