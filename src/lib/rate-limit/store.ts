import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env, isProduction } from "@/lib/env";

type ConsumeRateLimitInput = {
  bucketKey: string;
  scope: string;
  limit: number;
  windowMs: number;
  now: Date;
};

type ConsumeRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  resetAt: Date;
};

type AcquireLeaseInput = {
  bucketKey: string;
  concurrentLimit: number;
  leaseTtlMs: number;
  now: Date;
};

type AcquireLeaseResult = {
  acquired: boolean;
  ownerKey: string;
  retryAfterSeconds: number;
};

type RateLimitStore = {
  consume(input: ConsumeRateLimitInput): Promise<ConsumeRateLimitResult>;
  clear(bucketKey: string): Promise<void>;
  acquireLease(input: AcquireLeaseInput): Promise<AcquireLeaseResult>;
  releaseLease(ownerKey: string): Promise<void>;
};

type RedisLikeClient = {
  isOpen?: boolean;
  connect?: () => Promise<unknown>;
  eval: (
    script: string,
    input: {
      keys: string[];
      arguments: string[];
    },
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  zRem: (key: string, member: string) => Promise<unknown>;
};

let redisClientPromise: Promise<RedisLikeClient | null> | null = null;

function logRateLimitDev(message: string, metadata?: Record<string, unknown>) {
  if (!isProduction) {
    console.warn(`[rate-limit] ${message}`, metadata ?? {});
  }
}

function buildRedisKey(kind: "hits" | "leases", bucketKey: string) {
  return `${env.RATE_LIMIT_REDIS_PREFIX}:${kind}:${bucketKey}`;
}

function buildResetAtFromRetryAfter(now: Date, retryAfterSeconds: number) {
  return new Date(now.getTime() + retryAfterSeconds * 1000);
}

async function getRedisClient() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const redis = await import("redis");
        const client = redis.createClient({
          url: env.REDIS_URL,
        }) as unknown as RedisLikeClient;
        if (typeof client.connect === "function" && client.isOpen !== true) {
          await client.connect();
        }
        return client;
      } catch (error) {
        logRateLimitDev("Redis rate-limit backend unavailable; falling back to Prisma.", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    })();
  }

  return redisClientPromise;
}

const REDIS_CONSUME_SCRIPT = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local minScore = nowMs - windowMs
redis.call("ZREMRANGEBYSCORE", key, 0, minScore)
local count = redis.call("ZCARD", key)
if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local oldestScore = oldest[2]
  local retryAfterMs = windowMs
  if oldestScore then
    retryAfterMs = math.max(1000, (tonumber(oldestScore) + windowMs) - nowMs)
  end
  return {0, count, retryAfterMs}
end
redis.call("ZADD", key, nowMs, member)
redis.call("PEXPIRE", key, windowMs)
return {1, count + 1, windowMs}
`;

const REDIS_LEASE_SCRIPT = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local leaseTtlMs = tonumber(ARGV[2])
local concurrentLimit = tonumber(ARGV[3])
local ownerKey = ARGV[4]
redis.call("ZREMRANGEBYSCORE", key, 0, nowMs)
local count = redis.call("ZCARD", key)
if count >= concurrentLimit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local oldestScore = oldest[2]
  local retryAfterMs = leaseTtlMs
  if oldestScore then
    retryAfterMs = math.max(1000, tonumber(oldestScore) - nowMs)
  end
  return {0, retryAfterMs}
end
redis.call("ZADD", key, nowMs + leaseTtlMs, ownerKey)
redis.call("PEXPIRE", key, leaseTtlMs)
return {1, leaseTtlMs}
`;

async function consumeWithRedis(client: RedisLikeClient, input: ConsumeRateLimitInput): Promise<ConsumeRateLimitResult> {
  const nowMs = input.now.getTime();
  const member = `${nowMs}:${randomUUID()}`;
  const result = (await client.eval(REDIS_CONSUME_SCRIPT, {
    keys: [buildRedisKey("hits", input.bucketKey)],
    arguments: [String(nowMs), String(input.windowMs), String(input.limit), member],
  })) as [number, number, number] | null;
  const allowed = Number(result?.[0] ?? 0) === 1;
  const retryAfterSeconds = Math.max(1, Math.ceil(Number(result?.[2] ?? input.windowMs) / 1000));
  const usedCount = Number(result?.[1] ?? input.limit);

  return {
    allowed,
    retryAfterSeconds,
    remaining: allowed ? Math.max(0, input.limit - usedCount) : 0,
    resetAt: buildResetAtFromRetryAfter(input.now, retryAfterSeconds),
  };
}

async function clearWithRedis(client: RedisLikeClient, bucketKey: string) {
  await client.del(buildRedisKey("hits", bucketKey));
}

async function acquireLeaseWithRedis(client: RedisLikeClient, input: AcquireLeaseInput): Promise<AcquireLeaseResult> {
  const ownerKey = `${input.bucketKey}:${randomUUID()}`;
  const result = (await client.eval(REDIS_LEASE_SCRIPT, {
    keys: [buildRedisKey("leases", input.bucketKey)],
    arguments: [
      String(input.now.getTime()),
      String(input.leaseTtlMs),
      String(input.concurrentLimit),
      ownerKey,
    ],
  })) as [number, number] | null;

  return {
    acquired: Number(result?.[0] ?? 0) === 1,
    ownerKey,
    retryAfterSeconds: Math.max(1, Math.ceil(Number(result?.[1] ?? input.leaseTtlMs) / 1000)),
  };
}

async function releaseLeaseWithRedis(client: RedisLikeClient, ownerKey: string) {
  const bucketKey = ownerKey.split(":").slice(0, -1).join(":");
  await client.zRem(buildRedisKey("leases", bucketKey), ownerKey);
}

async function consumeWithPrisma(input: ConsumeRateLimitInput): Promise<ConsumeRateLimitResult> {
  const windowStart = new Date(input.now.getTime() - input.windowMs);
  const expiresAt = new Date(input.now.getTime() + input.windowMs);

  await prisma.rateLimitHit.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: input.now } },
        {
          bucketKey: input.bucketKey,
          createdAt: { lt: windowStart },
        },
      ],
    },
  });

  const existingCount = await prisma.rateLimitHit.count({
    where: {
      bucketKey: input.bucketKey,
      createdAt: { gte: windowStart },
      expiresAt: { gt: input.now },
    },
  });

  if (existingCount >= input.limit) {
    const oldestHit = await prisma.rateLimitHit.findFirst({
      where: {
        bucketKey: input.bucketKey,
        createdAt: { gte: windowStart },
        expiresAt: { gt: input.now },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        createdAt: true,
      },
    });
    const retryAfterMs = oldestHit
      ? Math.max(1_000, oldestHit.createdAt.getTime() + input.windowMs - input.now.getTime())
      : input.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return {
      allowed: false,
      retryAfterSeconds,
      remaining: 0,
      resetAt: buildResetAtFromRetryAfter(input.now, retryAfterSeconds),
    };
  }

  await prisma.rateLimitHit.create({
    data: {
      bucketKey: input.bucketKey,
      scope: input.scope,
      expiresAt,
    },
  });

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil(input.windowMs / 1000)),
    remaining: Math.max(0, input.limit - existingCount - 1),
    resetAt: expiresAt,
  };
}

async function clearWithPrisma(bucketKey: string) {
  await prisma.rateLimitHit.deleteMany({
    where: {
      bucketKey,
    },
  });
}

async function acquireLeaseWithPrisma(input: AcquireLeaseInput): Promise<AcquireLeaseResult> {
  const ownerKey = `${input.bucketKey}:${randomUUID()}`;
  const expiresAt = new Date(input.now.getTime() + input.leaseTtlMs);

  await prisma.rateLimitLease.deleteMany({
    where: {
      expiresAt: { lte: input.now },
    },
  });

  const activeCount = await prisma.rateLimitLease.count({
    where: {
      bucketKey: input.bucketKey,
      expiresAt: { gt: input.now },
    },
  });

  if (activeCount >= input.concurrentLimit) {
    const oldestLease = await prisma.rateLimitLease.findFirst({
      where: {
        bucketKey: input.bucketKey,
        expiresAt: { gt: input.now },
      },
      orderBy: {
        expiresAt: "asc",
      },
      select: {
        expiresAt: true,
      },
    });
    const retryAfterMs = oldestLease
      ? Math.max(1_000, oldestLease.expiresAt.getTime() - input.now.getTime())
      : input.leaseTtlMs;

    return {
      acquired: false,
      ownerKey,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  await prisma.rateLimitLease.create({
    data: {
      bucketKey: input.bucketKey,
      ownerKey,
      expiresAt,
    },
  });

  return {
    acquired: true,
    ownerKey,
    retryAfterSeconds: Math.max(1, Math.ceil(input.leaseTtlMs / 1000)),
  };
}

async function releaseLeaseWithPrisma(ownerKey: string) {
  await prisma.rateLimitLease.deleteMany({
    where: {
      ownerKey,
    },
  });
}

const prismaRateLimitStore: RateLimitStore = {
  consume: consumeWithPrisma,
  clear: clearWithPrisma,
  acquireLease: acquireLeaseWithPrisma,
  releaseLease: releaseLeaseWithPrisma,
};

export async function getRateLimitStore(): Promise<RateLimitStore> {
  const redisClient = await getRedisClient();

  if (!redisClient) {
    return prismaRateLimitStore;
  }

  return {
    consume: (input) => consumeWithRedis(redisClient, input),
    clear: (bucketKey) => clearWithRedis(redisClient, bucketKey),
    acquireLease: (input) => acquireLeaseWithRedis(redisClient, input),
    releaseLease: (ownerKey) => releaseLeaseWithRedis(redisClient, ownerKey),
  };
}
