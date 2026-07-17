import { randomBytes } from "crypto";

if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
}
if (!process.env.OAUTH_STATE_SECRET) {
  process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
}
