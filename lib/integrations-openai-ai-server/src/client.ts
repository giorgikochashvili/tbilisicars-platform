import OpenAI from "openai";

const replitBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const directKey = process.env.OPENAI_API_KEY;

const replitProxyActive =
  Boolean(replitBaseURL) &&
  Boolean(replitKey) &&
  !String(replitKey).startsWith("_DUMMY_");

if (!replitProxyActive && !directKey) {
  console.warn(
    "[openai-client] No usable OpenAI credentials found. " +
    "Set OPENAI_API_KEY, or activate the Replit OpenAI AI Integration. " +
    "AI features will fail until a valid key is provided.",
  );
}

export const openai = replitProxyActive
  ? new OpenAI({ apiKey: replitKey!, baseURL: replitBaseURL! })
  : new OpenAI({ apiKey: directKey ?? "not-configured" });
