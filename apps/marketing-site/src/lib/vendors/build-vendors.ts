/**
 * Vendor data processing algorithm.
 *
 * Reads the Clover POS inventory export (`vendor-data.xlsx`) and converts it
 * into the in-memory {@link VendorData} shape used by the marketing site for
 * browsing, searching, and featuring vendors.
 *
 * This module is the *process* that produces vendor data. It is invoked once at
 * build time through a cached loader (see `data.ts`), so the workbook is parsed
 * a single time and the result is cached indefinitely by Next.js — there is no
 * committed `vendors.json` artifact.
 *
 * Domain mapping
 * --------------
 * The workbook is a Clover inventory export, not a purpose-built vendor list.
 * In this marketplace every Clover **Category** corresponds to one vendor/brand,
 * and each row in the `Items` sheet is attributed to a vendor through its
 * `Categories` column. We therefore:
 *
 *   1. Read the `Items` sheet and group visible items by their `Categories`
 *      value (the vendor name). Hidden items and items with no category
 *      (store-general SKUs) are skipped.
 *   2. For each vendor, aggregate an item count, price range, a few sample item
 *      names, and — most importantly — a normalized `searchKey` combining the
 *      vendor name and all of its item names so search is a cheap lookup at
 *      runtime.
 */
import { join } from "node:path";
import { Data, Effect } from "effect";
import ExcelJS from "exceljs";
import { buildSearchKey, slugify } from "./normalize";
import type { PriceRange, Vendor, VendorData } from "./types";

const SOURCE_FILE = "vendor-data.xlsx";
const SOURCE_PATH = join(process.cwd(), "src/lib/vendors", SOURCE_FILE);

const ITEMS_SHEET = "Items";
const MAX_SAMPLE_ITEMS = 5;

/** Raised when the vendor workbook cannot be read or parsed. */
export class VendorDataError extends Data.TaggedError("VendorDataError")<{
  readonly cause: unknown;
}> {}

/** Coerce an ExcelJS cell value into a trimmed plain string. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((run) => run.text)
        .join("")
        .trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("result" in value) {
      return cellText(value.result as ExcelJS.CellValue);
    }
  }
  return "";
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = cellText(value);
  if (!text) {
    return null;
  }
  const parsed = Number.parseFloat(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

type RawItem = {
  name: string;
  category: string;
  price: number | null;
  hidden: boolean;
};

/** Map the `Items` sheet header row to column indexes (1-based). */
function readHeader(row: ExcelJS.Row): Map<string, number> {
  const header = new Map<string, number>();
  row.eachCell((cell, colNumber) => {
    const key = cellText(cell.value).toLowerCase();
    if (key) {
      header.set(key, colNumber);
    }
  });
  return header;
}

function readItems(worksheet: ExcelJS.Worksheet): RawItem[] {
  const header = readHeader(worksheet.getRow(1));
  const nameCol = header.get("name");
  const categoryCol = header.get("categories");
  const priceCol = header.get("price");
  const hiddenCol = header.get("hidden?");

  if (!nameCol || !categoryCol) {
    throw new Error(
      `Unexpected sheet layout: could not find "Name"/"Categories" columns in "${ITEMS_SHEET}".`,
    );
  }

  const items: RawItem[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const name = cellText(row.getCell(nameCol).value);
    const category = cellText(row.getCell(categoryCol).value);
    if (!name || !category) {
      return;
    }
    const hidden =
      hiddenCol ?
        cellText(row.getCell(hiddenCol).value).toLowerCase() === "yes"
      : false;
    const price = priceCol ? cellNumber(row.getCell(priceCol).value) : null;
    items.push({ name, category, price, hidden });
  });
  return items;
}

function toVendor(name: string, items: RawItem[]): Vendor {
  const prices = items
    .map((item) => item.price)
    .filter((price): price is number => price !== null && price > 0);

  const priceRange: PriceRange | null =
    prices.length > 0 ?
      {
        min: Math.min(...prices),
        max: Math.max(...prices),
      }
    : null;

  const itemNames = items.map((item) => item.name);
  const uniqueItemNames = [...new Set(itemNames)];

  return {
    name,
    slug: slugify(name),
    searchKey: buildSearchKey([name, ...itemNames]),
    itemCount: items.length,
    priceRange,
    sampleItems: uniqueItemNames.slice(0, MAX_SAMPLE_ITEMS),
    items: uniqueItemNames,
  };
}

/**
 * Synchronously turn a loaded workbook into the full {@link VendorData}. Pure
 * (no IO) so it composes inside `Effect.try`; may throw on an unexpected sheet
 * layout, which the caller converts into a {@link VendorDataError}.
 */
function parseWorkbook(workbook: ExcelJS.Workbook): VendorData {
  const itemsSheet = workbook.getWorksheet(ITEMS_SHEET);
  if (!itemsSheet) {
    throw new Error(`Missing "${ITEMS_SHEET}" sheet in ${SOURCE_FILE}.`);
  }

  const items = readItems(itemsSheet);

  const byVendor = new Map<string, RawItem[]>();
  for (const item of items) {
    if (item.hidden) {
      continue;
    }
    const existing = byVendor.get(item.category);
    if (existing) {
      existing.push(item);
    } else {
      byVendor.set(item.category, [item]);
    }
  }

  const vendors = [...byVendor.entries()]
    .map(([name, vendorItems]) => toVendor(name, vendorItems))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    source: SOURCE_FILE,
    count: vendors.length,
    vendors,
  };
}

/**
 * Parse the vendor workbook and build the full {@link VendorData}.
 *
 * Modeled as an Effect (matching the rest of the codebase): the workbook read
 * is wrapped with `Effect.tryPromise` and the pure parse with `Effect.try`, so
 * both failure modes surface as a typed {@link VendorDataError} on the error
 * channel. It requires no services (`R = never`), so callers can execute it
 * with a plain `Effect.runPromise` — see the cached loader in `data.ts`.
 */
export const buildVendorData: Effect.Effect<VendorData, VendorDataError> =
  Effect.gen(function* () {
    const workbook = new ExcelJS.Workbook();

    yield* Effect.tryPromise({
      try: () => workbook.xlsx.readFile(SOURCE_PATH),
      catch: (cause) => new VendorDataError({ cause }),
    });

    return yield* Effect.try({
      try: () => parseWorkbook(workbook),
      catch: (cause) => new VendorDataError({ cause }),
    });
  });
