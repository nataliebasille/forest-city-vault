import { NextRequest } from "next/server";
import { Cookies } from "./cookies";
import { Headers } from "./headers";
import { Layer } from "effect";
import { Body } from "./body";

const REQUEST_STATE_DEPS = [Body, Cookies, Headers] as const;
export type RequestStateDeps = InstanceType<
  (typeof REQUEST_STATE_DEPS)[number]
>;
export function buildRequestStateLayer(
  type: "route",
  request: NextRequest,
): Layer.Layer<RequestStateDeps>;
export function buildRequestStateLayer(
  type: "page",
): Layer.Layer<RequestStateDeps>;

export function buildRequestStateLayer(
  ...args: [type: "route", request: NextRequest] | [type: "page"]
) {
  const layers =
    args[0] === "route" ?
      REQUEST_STATE_DEPS.map((Tag) => Tag.fromRequest(args[1]))
    : REQUEST_STATE_DEPS.map((Tag) => Tag.forPage());

  return mergeLayers(layers);
}

function mergeLayers(
  layers: ReadonlyArray<Layer.Layer<any, any, any>>,
): Layer.Layer<any, any, any> {
  return layers.reduce(
    (acc, layer) => Layer.merge(acc, layer),
    Layer.empty as Layer.Layer<any, never, never>,
  );
}
