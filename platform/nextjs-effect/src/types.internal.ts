export type MustBeNever<R> =
  [R] extends [never] ? unknown
  : {
      readonly ERROR: "Route handler has missing dependencies";
      readonly remaining: R;
    };
