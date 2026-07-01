import { makeIdGenerator } from "./make-id-generator";
import { v7 as uuidv7 } from "uuid";

export const SystemIdGenerator = makeIdGenerator(() => uuidv7());
