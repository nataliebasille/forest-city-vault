import { AggregateRoot } from "@forest-city-vault/core-domain";
import { SaleSource } from "./sale-source.entity";
import { SaleItem } from "./sale-item.entity";

export type Sale = AggregateRoot<{
  source: SaleSource;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  occurredAt: Date;
}>;
