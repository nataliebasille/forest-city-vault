// scripts/generate-drizzle-flat-schema.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbSchema } from "../src";

type Entry = {
  exportName: string;
  path: string[];
};

const isPlainNamespaceObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const collectLeaves = (
  value: Record<string, unknown>,
  path: string[] = [],
): Entry[] => {
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = [...path, key];

    // Recurse only into your namespace objects.
    // Drizzle table objects are not plain namespace objects.
    if (isPlainNamespaceObject(child)) {
      return collectLeaves(child, nextPath);
    }

    return [
      {
        exportName: nextPath.join("_"),
        path: nextPath,
      },
    ];
  });
};

const entries = collectLeaves(dbSchema);

const file = `// GENERATED FILE. DO NOT EDIT.
// Run: pnpm generate:drizzle-schema

import { dbSchema } from "..";

${entries
  .map(
    ({ exportName, path }) =>
      `export const ${exportName} = dbSchema.${path.join(".")};`,
  )
  .join("\n")}
`;

writeFileSync(resolve("src/drizzle-flat.ts"), file);
