import { makeIdGenerator } from "./make-id-generator";

export const staticIdGenerator = (id: string) => makeIdGenerator(() => id);
