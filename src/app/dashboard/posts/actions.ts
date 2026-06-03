"use server";

import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";
import { initialFormState, postFormSchema, type FormState } from "@/lib/validation";

function toDateOrNull(value: string) {
  return value ? new Date(value) : null;
}

export async function savePostAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser();
  const parsed = postFormSchema.safeParse({
    postId: formData.get("postId"),
    mediaAssetId: formData.get("mediaAssetId"),
    internalTitle: formData.get("internalTitle"),
    caption: formData.get("caption"),
    scheduledAt: formData.get("scheduledAt"),
    platform: formData.get("platform"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  const isScheduling = parsed.data.intent === "schedule";
  const nextStatus = isScheduling ? SocialPostStatus.SCHEDULED : SocialPostStatus.DRAFT;
  const scheduledAt = toDateOrNull(parsed.data.scheduledAt);

  if (parsed.data.mediaAssetId) {
    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: parsed.data.mediaAssetId },
      select: { id: true },
    });

    if (!mediaAsset) {
      return {
        ...initialFormState,
        message: "Upload media again before saving the post.",
      };
    }
  }

  try {
    const post = await prisma.$transaction(async (tx) => {
      const data = {
        internalTitle: parsed.data.internalTitle,
        caption: parsed.data.caption,
        status: nextStatus,
        scheduledAt,
        failureReason: null,
        mediaAssetId: parsed.data.mediaAssetId || null,
        updatedByAdminUserId: adminUser.id,
      };

      let savedPost;

      if (parsed.data.postId) {
        const existingPost = await tx.socialPost.findUnique({
          where: { id: parsed.data.postId },
        });

        if (!existingPost) {
          throw new Error("Post not found.");
        }

        if (
          existingPost.status === SocialPostStatus.PUBLISHED ||
          existingPost.status === SocialPostStatus.PUBLISHING
        ) {
          throw new Error("Published or publishing posts are locked in this phase.");
        }

        savedPost = await tx.socialPost.update({
          where: { id: parsed.data.postId },
          data,
        });
      } else {
        savedPost = await tx.socialPost.create({
          data: {
            ...data,
            createdByAdminUserId: adminUser.id,
          },
        });
      }

      await tx.socialPostPlatform.upsert({
        where: {
          socialPostId_platform: {
            socialPostId: savedPost.id,
            platform: SocialPlatform.FACEBOOK,
          },
        },
        update: {
          status: nextStatus,
          scheduledAt,
          lastError: null,
        },
        create: {
          socialPostId: savedPost.id,
          platform: SocialPlatform.FACEBOOK,
          status: nextStatus,
          scheduledAt,
        },
      });

      return savedPost;
    });

    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: parsed.data.postId ? AUDIT_ACTIONS.POST_UPDATED : AUDIT_ACTIONS.POST_CREATED,
      targetType: "SocialPost",
      targetId: post.id,
      ipAddress,
      userAgent,
      metadata: {
        status: nextStatus,
        platform: SocialPlatform.FACEBOOK,
      },
    });

    if (isScheduling) {
      await createAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_SCHEDULED,
        targetType: "SocialPost",
        targetId: post.id,
        ipAddress,
        userAgent,
        metadata: {
          scheduledAt: scheduledAt?.toISOString() ?? null,
        },
      });
    }

    redirect(`/dashboard/posts/${post.id}?saved=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the post.";
    return {
      ...initialFormState,
      message,
    };
  }
}
