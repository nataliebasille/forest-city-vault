import { Layer, ManagedRuntime } from "effect";

export type AppRuntime<Services, Error = never> = ManagedRuntime.ManagedRuntime<
  Services,
  Error
>;

export function createRuntime<Services, Error = never>(
  appLayer: Layer.Layer<Services, Error>,
): AppRuntime<Services, Error> {
  return ManagedRuntime.make(appLayer);
}
