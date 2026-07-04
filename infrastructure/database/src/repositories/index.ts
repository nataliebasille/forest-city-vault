import { EventStore, EventTracker } from "@forest-city-vault/core-domain";
import { Layer } from "effect";
import { EventStorePersistenceLive } from "../event-store";
import { SalesRepositoryLive } from "./sales";

export * from "./sales";

export const RepositoriesLive = SalesRepositoryLive.pipe(
  Layer.provideMerge(EventStore.make(EventStorePersistenceLive)),
  Layer.provideMerge(EventTracker.make),
);
