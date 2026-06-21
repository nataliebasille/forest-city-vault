// Used by the drizzle db:generate to create the inbox tables
// the file requires a flat export of all inboxes to work with the generator

import { getTableName, isTable } from "drizzle-orm";
import * as inboxes from "./index";

function collectTables(value: unknown, tables: Record<string, unknown>) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (isTable(value)) {
    tables[getTableName(value)] = value;
    return;
  }

  for (const nestedValue of Object.values(value)) {
    collectTables(nestedValue, tables);
  }
}

const tables: Record<string, unknown> = {};

collectTables(inboxes, tables);

export default tables;
