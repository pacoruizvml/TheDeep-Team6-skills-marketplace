// Writes the synthetic dataset to ./data-export for inspection (JSON). Not needed to run the servers.
import fs from "node:fs";
import { dataset } from "../src/lib/data.js";
const ds = dataset();
fs.mkdirSync("data-export", { recursive: true });
for (const [k, v] of Object.entries(ds)) fs.writeFileSync(`data-export/${k}.json`, JSON.stringify(v, null, 2));
console.log("Exported to ./data-export:", ds.meta.counts);
