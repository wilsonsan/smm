import "server-only";

import { env, isProduction } from "@/lib/env";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { formatRateLimitWindow, type RateLimitDefinition, type RateLimitLeaseDefinition, type RateLimitScope } from "@/lib/rate-limit/config";
import { getRateLimitStore } from "@/lib/rate-limit/store";

export class RateLimitExceededError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;
  readonly limitName: string;
  readonly scope: RateLimitScope;
  readonly configuredLimit: number;
  readonly windowMs: number;

  constructor(input: {
    message: string;
    retryAfterSeconds: number;
    limitName: string;
    scope: RateLimitScope;
    configuredLimit: number;
    windowMs: number;
  }) {
    super(input.message);
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.limitName = input.limitName;
    this.scope = input.scope;
    this.configuredLimit = input.configuredLimit;
    this.windowMs = input.windowMs;
  }
}

export type RateLimitContext = {
  actorAdminUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  endpoint: string;
  attemptedAction: string;
  method?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  email?: string | null;
};

export type RateLimitLease = {
  ownerKey: string;
  release: () => Promise<void>;
};

function logRateLimitDev(message: string, metadata?: Record<string, unknown>) {
  if (!isProduction) {
    console.warn(`[rate-limit] ${message}`, metadata ?? {});
  }
}

function sanitizeBucketValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_./-]+/g, "-");
}

function resolveOrganizationScope(context: RateLimitContext) {
  return context.organizationId?.trim() || env.APP_URL;
}

function resolveScopeValue(scope: RateLimitScope, context: RateLimitContext) {
  if (scope === "user") {
    return context.userId?.trim() || context.actorAdminUserId?.trim() || "anonymous-user";
  }

  if (scope === "organization") {
    return resolveOrganizationScope(context);
  }

  if (scope === "email") {
    return context.email?.trim().toLowerCase() || "unknown-email";
  }

  return context.ipAddress?.trim() || "unknown-ip";
}

function buildBucketKey(definition: RateLimitDefinition, context: RateLimitContext) {
  return sanitizeBucketValue(`${definition.name}:${definition.scope}:${resolveScopeValue(definition.scope, context)}`);
}

async function auditRateLimitExceeded(definition: RateLimitDefinition, context: RateLimitContext, retryAfterSeconds: number) {
  const metadata = {
    endpoint: context.endpoint,
    attemptedAction: context.attemptedAction,
    method: context.method ?? null,
    scope: definition.scope,
    scopeValue: resolveScopeValue(definition.scope, context),
    configuredLimit: {
      limit: definition.limit,
      windowMs: definition.windowMs,
      windowLabel: formatRateLimitWindow(definition.windowMs),
    },
    retryAfterSeconds,
    limitType: definition.name,
  };

  if (context.actorAdminUserId) {
    await createAuditLog({
      actorAdminUserId: context.actorAdminUserId,
      action: AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED,
      targetType: "RateLimit",
      targetId: definition.name,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata,
    }).catch(() => undefined);
  } else {
    await createAuditLog({
      action: AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED,
      targetType: "RateLimit",
      targetId: definition.name,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata,
    }).catch(() => undefined);
  }

  logRateLimitDev("Exceeded", metadata);
}

export async function enforceRateLimit(definition: RateLimitDefinition, context: RateLimitContext) {
  const store = await getRateLimitStore();
  const now = new Date();
  const bucketKey = buildBucketKey(definition, context);
  const result = await store.consume({
    bucketKey,
    scope: definition.scope,
    limit: definition.limit,
    windowMs: definition.windowMs,
    now,
  });

  if (!result.allowed) {
    await auditRateLimitExceeded(definition, context, result.retryAfterSeconds);
    throw new RateLimitExceededError({
      message: definition.message,
      retryAfterSeconds: result.retryAfterSeconds,
      limitName: definition.name,
      scope: definition.scope,
      configuredLimit: definition.limit,
      windowMs: definition.windowMs,
    });
  }

  return result;
}

export async function clearRateLimit(definition: RateLimitDefinition, context: Pick<RateLimitContext, "actorAdminUserId" | "userId" | "organizationId" | "email" | "ipAddress">) {
  const store = await getRateLimitStore();
  const bucketKey = buildBucketKey(definition, {
    actorAdminUserId: context.actorAdminUserId ?? null,
    endpoint: definition.name,
    attemptedAction: definition.actionLabel,
    userId: context.userId ?? null,
    organizationId: context.organizationId ?? null,
    email: context.email ?? null,
    ipAddress: context.ipAddress ?? null,
  });
  await store.clear(bucketKey);
}

export async function acquireRateLimitLease(definition: RateLimitLeaseDefinition, context: RateLimitContext): Promise<RateLimitLease> {
  const store = await getRateLimitStore();
  const now = new Date();
  const bucketKey = buildBucketKey(definition, context);
  const result = await store.acquireLease({
    bucketKey,
    concurrentLimit: definition.concurrentLimit,
    leaseTtlMs: definition.leaseTtlMs,
    now,
  });

  if (!result.acquired) {
    await auditRateLimitExceeded(definition, context, result.retryAfterSeconds);
    throw new RateLimitExceededError({
      message: definition.message,
      retryAfterSeconds: result.retryAfterSeconds,
      limitName: definition.name,
      scope: definition.scope,
      configuredLimit: definition.concurrentLimit,
      windowMs: definition.leaseTtlMs,
    });
  }

  return {
    ownerKey: result.ownerKey,
    release: () => store.releaseLease(result.ownerKey),
  };
}

export function isRateLimitExceededError(error: unknown): error is RateLimitExceededError {
  return error instanceof RateLimitExceededError;
}

export function buildRateLimitHeaders(error: RateLimitExceededError) {
  return {
    "Retry-After": String(error.retryAfterSeconds),
  };
}
