import { Layer } from "effect"
import { KyselyDbLive } from "../db/kysely.js"

export const AppLayer = Layer.merge(KyselyDbLive, Layer.empty)
