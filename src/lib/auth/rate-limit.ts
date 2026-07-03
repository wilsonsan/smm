import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { clearRateLimit, enforceRateLimit, isRateLimitExceededError, type RateLimitContext } from "@/lib/rate-limit";

export async function isFailedAuthRateLimitedByIp(input: {
  actions: string[];
  ipAddress: string | null;
  windowMinutes: number;
  maxAttempts: number;
}) {
  const context: RateLimitContext = {
    endpoint: "login",
    attemptedAction: input.actions.join(","),
    ipAddress: input.ipAddress,
  };

  try {
    await enforceRateLimit(RATE_LIMITS.authentication.loginFailed, context);
    return false;
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return true;
    }

    throw error;
  }
}

export async function clearFailedAuthRateLimitByIp(ipAddress: string | null) {
  await clearRateLimit(RATE_LIMITS.authentication.loginFailed, {
    ipAddress,
  });
}
