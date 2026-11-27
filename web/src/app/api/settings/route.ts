import { route } from "@/server/http";
import { ROLE_PERMISSIONS } from "@/server/auth";

/** Non-secret configuration facts for the Settings page. Never returns values of secrets. */
export const GET = route(async () => {
  let mockHost: string | null = null;
  try {
    mockHost = process.env.MOCK_API_BASE_URL ? new URL(process.env.MOCK_API_BASE_URL).host : null;
  } catch {
    mockHost = null;
  }
  return {
    roles: ROLE_PERMISSIONS,
    integrations: {
      mockHost,
      timeoutMs: Number(process.env.MOCK_API_TIMEOUT_MS ?? 5000),
      webhookSecretConfigured: Boolean(process.env.WEBHOOK_SECRET),
      assistantServiceConfigured: Boolean(process.env.ASSISTANT_SERVICE_URL),
    },
  };
});
