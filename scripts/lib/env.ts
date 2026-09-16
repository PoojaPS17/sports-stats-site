import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  config({ path: envLocal });
} else {
  config();
}
