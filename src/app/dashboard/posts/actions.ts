"use server";

import { Prisma, SocialPlatform, SocialPostStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import {
  claimFacebookPostForPublishing,
  executeFacebookPublish,
  validateFacebookPublishPrerequisites,
} from "@/lib/facebook";
import {
  buildInternalPostTitle,
  canCancelScheduled,
  canDeleteDraft,
  canReturnToDraft,
  getPrimaryFacebookVariant,
  isReadOnlyPostStatus,
  validateAndResolveScheduledAt,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { getRequestMetadata } from "@/lib/http";
import { initialFormState, postFormSchema, type FormState } from "@/lib/validation";

async function createPostAuditLog(input: {
  action: string;
  actorAdminUserId: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: input.actorAdminUserId,
    action: input.action,
    targetType: "SocialPost",
    targetId: input.targetId,
    ipAddress,
    userAgent,
    metadata: input.metadata,
  });
}

function revalidatePostViews(postId?: string) {
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");

  if (postId) {
    revalidatePath(`/dashboard/posts/${postId}`);
  }
}

function buildPostDetailHref(
  postId: string,
  input?: { status?: "success" | "error"; message?: string; confirmImmediate?: boolean },
) {
  const params = new URLSearchParams();

  if (input?.status) {
    params.set("status", input.status);
  }

  if (input?.message) {
    params.set("message", input.message);
  }

  if (input?.confirmImmediate) {
    params.set("confirmImmediate", "1");
  }

  const suffix = params.toString();
  return suffix ? `/dashboard/posts/${postId}?${suffix}` : `/dashboard/posts/${postId}`;
}

async function getExistingPost(postId: string) {
  return prisma.socialPost.findUnique({
    where: { id: postId },
    include: {
      platforms: true,
      mediaAsset: {
        include: {
          variants: true,
        },
      },
    },
  });
}

function buildSubmittedPostValues(input: {
  caption?: FormDataEntryValue | string | null;
  scheduledDate?: FormDataEntryValue | string | null;
  scheduledHour?: FormDataEntryValue | string | null;
  scheduledMinute?: FormDataEntryValue | string | null;
  scheduledMeridiem?: FormDataEntryValue | string | null;
  mediaAssetId?: FormDataEntryValue | string | null;
  platform?: FormDataEntryValue | string | null;
}) {
  return {
    caption: String(input.caption || ""),
    scheduledDate: String(input.scheduledDate || ""),
    scheduledHour: String(input.scheduledHour || "5"),
    scheduledMinute: String(input.scheduledMinute || "00"),
    scheduledMeridiem: String(input.scheduledMeridiem || "PM"),
    mediaAssetId: String(input.mediaAssetId || ""),
    platform: String(input.platform || "FACEBOOK"),
  };
}

async function markImmediatePublishFailure(input: {
  postId: string;
  message: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.socialPost.update({
      where: {
        id: input.postId,
      },
      data: {
        status: SocialPostStatus.FAILED,
        failureReason: input.message,
      },
    });

    await tx.socialPostPlatform.updateMany({
      where: {
        socialPostId: input.postId,
        platform: SocialPlatform.FACEBOOK,
      },
      data: {
        status: SocialPostStatus.FAILED,
        lastError: input.message,
      },
    });
  });
}

export async function savePostAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser();
  const submittedValues = buildSubmittedPostValues({
    caption: formData.get("caption"),
    scheduledDate: formData.get("scheduledDate"),
    scheduledHour: formData.get("scheduledHour"),
    scheduledMinute: formData.get("scheduledMinute"),
    scheduledMeridiem: formData.get("scheduledMeridiem"),
    mediaAssetId: formData.get("mediaAssetId"),
    platform: formData.get("platform"),
  });
  const parsed = postFormSchema.safeParse({
    postId: formData.get("postId"),
    mediaAssetId: formData.get("mediaAssetId"),
    caption: formData.get("caption"),
    scheduledDate: formData.get("scheduledDate"),
    scheduledHour: formData.get("scheduledHour"),
    scheduledMinute: formData.get("scheduledMinute"),
    scheduledMeridiem: formData.get("scheduledMeridiem"),
    platform: formData.get("platform"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      submittedValues,
    };
  }

  try {
    const isImmediatePublish = parsed.data.intent === "publish";
    const { scheduledAt, timezone } = await validateAndResolveScheduledAt({
      intent: parsed.data.intent,
      scheduledDate: parsed.data.scheduledDate,
      scheduledHour: parsed.data.scheduledHour,
      scheduledMinute: parsed.data.scheduledMinute,
      scheduledMeridiem: parsed.data.scheduledMeridiem,
    });
    const effectiveScheduledAt = isImmediatePublish ? new Date() : scheduledAt;

    const nextStatus =
      parsed.data.intent === "schedule" ? SocialPostStatus.SCHEDULED : SocialPostStatus.DRAFT;
    const selectedMediaAsset = parsed.data.mediaAssetId
      ? await prisma.mediaAsset.findUnique({
          where: { id: parsed.data.mediaAssetId },
          include: {
            variants: true,
          },
        })
      : null;

    if (parsed.data.mediaAssetId && !selectedMediaAsset) {
      return {
        ...initialFormState,
        message: "Choose a valid uploaded media asset before saving.",
        submittedValues,
      };
    }

    if (
      parsed.data.platform === SocialPlatform.FACEBOOK &&
      selectedMediaAsset &&
      !getPrimaryFacebookVariant(selectedMediaAsset) &&
      parsed.data.intent !== "publish"
    ) {
      return {
        ...initialFormState,
        message: "The selected media asset is missing a FACEBOOK_FEED variant.",
        submittedValues,
      };
    }

    const post = await prisma.$transaction(async (tx) => {
      const data = {
        internalTitle: buildInternalPostTitle(parsed.data.caption),
        caption: parsed.data.caption,
        status: nextStatus,
        scheduledAt: effectiveScheduledAt,
        failureReason: null,
        mediaAssetId: parsed.data.mediaAssetId || null,
        updatedByAdminUserId: adminUser.id,
      };

      let savedPost;
      let previousMediaAssetId: string | null = null;
      let previousStatus: SocialPostStatus | null = null;
      let previousScheduledAt: Date | null = null;

      if (parsed.data.postId) {
        const existingPost = await tx.socialPost.findUnique({
          where: { id: parsed.data.postId },
        });

        if (!existingPost) {
          throw new Error("Post not found.");
        }

        if (isReadOnlyPostStatus(existingPost.status)) {
          throw new Error("Publishing and published posts are read-only.");
        }

        previousMediaAssetId = existingPost.mediaAssetId;
        previousStatus = existingPost.status;
        previousScheduledAt = existingPost.scheduledAt;

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
          scheduledAt: effectiveScheduledAt,
          publishedAt: null,
          platformPostId: null,
          platformPostUrl: null,
          lastError: null,
        },
        create: {
          socialPostId: savedPost.id,
          platform: SocialPlatform.FACEBOOK,
          status: nextStatus,
          scheduledAt: effectiveScheduledAt,
        },
      });

      return {
        post: savedPost,
        previousMediaAssetId,
        previousStatus,
        previousScheduledAt,
      };
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: parsed.data.postId ? AUDIT_ACTIONS.POST_UPDATED : AUDIT_ACTIONS.POST_CREATED,
      targetId: post.post.id,
      metadata: {
        status: nextStatus,
        platform: SocialPlatform.FACEBOOK,
      },
    });

    if (parsed.data.intent === "schedule" || parsed.data.intent === "draft") {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: parsed.data.intent === "schedule" ? AUDIT_ACTIONS.POST_SCHEDULED : AUDIT_ACTIONS.DRAFT_SAVED,
        targetId: post.post.id,
        metadata: {
          status: nextStatus,
          scheduledAt: effectiveScheduledAt?.toISOString() ?? null,
          timezone,
        },
      });
    }

    if ((post.previousMediaAssetId ?? null) !== (parsed.data.mediaAssetId || null)) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action:
          post.previousMediaAssetId && !parsed.data.mediaAssetId
            ? AUDIT_ACTIONS.POST_MEDIA_CLEARED
            : AUDIT_ACTIONS.POST_MEDIA_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousMediaAssetId: post.previousMediaAssetId,
          nextMediaAssetId: parsed.data.mediaAssetId || null,
        },
      });
    }

    if ((post.previousStatus ?? null) !== nextStatus) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: post.previousStatus,
          nextStatus,
        },
      });
    }

    if ((post.previousScheduledAt?.toISOString() ?? null) !== (effectiveScheduledAt?.toISOString() ?? null)) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_CALENDAR_DATETIME_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousScheduledAt: post.previousScheduledAt?.toISOString() ?? null,
          nextScheduledAt: effectiveScheduledAt?.toISOString() ?? null,
          status: nextStatus,
          timezone,
        },
      });
    }

    if (!isImmediatePublish) {
      revalidatePostViews(post.post.id);

      if (parsed.data.intent === "schedule" || (parsed.data.intent === "draft" && effectiveScheduledAt)) {
        redirect("/dashboard/calendar");
      }

      redirect(`/dashboard/posts/${post.post.id}`);
    }

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action:
        post.previousStatus === SocialPostStatus.FAILED
          ? AUDIT_ACTIONS.POST_PUBLISH_RETRY_REQUESTED
          : AUDIT_ACTIONS.POST_PUBLISH_MANUAL_REQUESTED,
      targetId: post.post.id,
      metadata: {
        previousStatus: post.previousStatus ?? nextStatus,
        requestedStatus: SocialPostStatus.PUBLISHING,
        mode: "manual-form",
        platform: SocialPlatform.FACEBOOK,
      },
    });

    try {
      await validateFacebookPublishPrerequisites({
        caption: parsed.data.caption,
        mediaAsset: selectedMediaAsset,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Facebook publishing prerequisites are not met.";

      await markImmediatePublishFailure({
        postId: post.post.id,
        message,
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
          platform: SocialPlatform.FACEBOOK,
          message,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message,
        }),
      );
    }

    const claim = await claimFacebookPostForPublishing({
      socialPostId: post.post.id,
      allowedStatuses: [SocialPostStatus.DRAFT, SocialPostStatus.SCHEDULED, SocialPostStatus.FAILED],
    });

    if (!claim.ok) {
      await markImmediatePublishFailure({
        postId: post.post.id,
        message: claim.message,
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
          platform: SocialPlatform.FACEBOOK,
          message: claim.message,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message: claim.message,
        }),
      );
    }

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
      targetId: post.post.id,
      metadata: {
        previousStatus: nextStatus,
        nextStatus: SocialPostStatus.PUBLISHING,
        mode: "manual-form",
        platform: SocialPlatform.FACEBOOK,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: post.post.id,
      metadata: {
        previousStatus: nextStatus,
        nextStatus: SocialPostStatus.PUBLISHING,
        mode: "manual-form",
      },
    });

    try {
      const result = await executeFacebookPublish({
        socialPostId: claim.socialPostId,
        socialPostPlatformId: claim.socialPostPlatformId,
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.PUBLISHED,
          mode: "manual-form",
          publishedAt: result.finishedAt.toISOString(),
          platform: SocialPlatform.FACEBOOK,
          platformPostId: result.result.platformPostId,
          platformPostUrl: result.result.platformPostUrl,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.PUBLISHED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect("/dashboard/calendar");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Facebook publishing failed.";

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
          platform: SocialPlatform.FACEBOOK,
          message,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message,
        }),
      );
    }

    revalidatePostViews(post.post.id);
    redirect("/dashboard/calendar");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the post.";
    return {
      ...initialFormState,
      message,
      submittedValues,
    };
  }
}

export async function deleteDraftPostAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const postId = String(formData.get("postId") || "");
  const post = await getExistingPost(postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  if (!canDeleteDraft(post.status)) {
    throw new Error("Only draft posts can be deleted.");
  }

  await prisma.socialPost.delete({
    where: { id: post.id },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_DELETED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
    },
  });

  revalidatePostViews(post.id);
  redirect("/dashboard/calendar");
}

export async function cancelScheduledPostAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const postId = String(formData.get("postId") || "");
  const post = await getExistingPost(postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  if (!canCancelScheduled(post.status)) {
    throw new Error("Only scheduled posts can be cancelled.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPost.update({
      where: { id: post.id },
      data: {
        status: SocialPostStatus.CANCELLED,
        updatedByAdminUserId: adminUser.id,
      },
    });

    await tx.socialPostPlatform.updateMany({
      where: { socialPostId: post.id },
      data: {
        status: SocialPostStatus.CANCELLED,
      },
    });
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_CANCELLED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.CANCELLED,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.CANCELLED,
    },
  });

  revalidatePostViews(post.id);
  redirect(`/dashboard/posts/${post.id}`);
}

export async function returnPostToDraftAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const postId = String(formData.get("postId") || "");
  const post = await getExistingPost(postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  if (!canReturnToDraft(post.status)) {
    throw new Error("This post cannot be returned to draft.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPost.update({
      where: { id: post.id },
      data: {
        status: SocialPostStatus.DRAFT,
        updatedByAdminUserId: adminUser.id,
      },
    });

    await tx.socialPostPlatform.updateMany({
      where: { socialPostId: post.id },
      data: {
        status: SocialPostStatus.DRAFT,
        scheduledAt: post.scheduledAt,
      },
    });
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_RETURNED_TO_DRAFT,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.DRAFT,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.DRAFT,
    },
  });

  revalidatePostViews(post.id);
  redirect(post.scheduledAt ? "/dashboard/calendar" : `/dashboard/posts/${post.id}`);
}

export async function publishPostNowAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const postId = String(formData.get("postId") || "");
  const confirmImmediate = String(formData.get("confirmImmediate") || "") === "1";
  const existingPost = await getExistingPost(postId);

  if (!existingPost) {
    throw new Error("Post not found.");
  }

  const allowedStatuses: SocialPostStatus[] = [
    SocialPostStatus.DRAFT,
    SocialPostStatus.SCHEDULED,
    SocialPostStatus.FAILED,
  ];
  if (!allowedStatuses.includes(existingPost.status)) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "Only draft, scheduled, or failed posts can be published manually.",
      }),
    );
  }

  if (existingPost.status === SocialPostStatus.SCHEDULED && existingPost.scheduledAt && existingPost.scheduledAt > new Date() && !confirmImmediate) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "This post is scheduled for the future. Confirm Post Now to publish immediately instead.",
        confirmImmediate: true,
      }),
    );
  }

  const publishNowAt = new Date();
  if ((existingPost.scheduledAt?.toISOString() ?? null) !== publishNowAt.toISOString()) {
    await prisma.$transaction(async (tx) => {
      await tx.socialPost.update({
        where: { id: existingPost.id },
        data: {
          scheduledAt: publishNowAt,
          updatedByAdminUserId: adminUser.id,
        },
      });

      await tx.socialPostPlatform.updateMany({
        where: {
          socialPostId: existingPost.id,
          platform: SocialPlatform.FACEBOOK,
        },
        data: {
          scheduledAt: publishNowAt,
        },
      });
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_CALENDAR_DATETIME_CHANGED,
      targetId: existingPost.id,
      metadata: {
        previousScheduledAt: existingPost.scheduledAt?.toISOString() ?? null,
        nextScheduledAt: publishNowAt.toISOString(),
        mode: "manual",
      },
    });
  }

  try {
    await validateFacebookPublishPrerequisites({
      caption: existingPost.caption,
      mediaAsset: existingPost.mediaAsset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook publishing prerequisites are not met.";

    await markImmediatePublishFailure({
      postId,
      message,
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
      targetId: postId,
      metadata: {
        previousStatus: existingPost.status,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
        platform: SocialPlatform.FACEBOOK,
        message,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: postId,
      metadata: {
        previousStatus: existingPost.status,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
      },
    });

    revalidatePostViews(postId);
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message,
      }),
    );
  }

  const claim = await claimFacebookPostForPublishing({
    socialPostId: postId,
    allowedStatuses,
  });

  if (!claim.ok) {
    revalidatePostViews(postId);
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: claim.message,
      }),
    );
  }

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action:
      existingPost.status === SocialPostStatus.FAILED
        ? AUDIT_ACTIONS.POST_PUBLISH_RETRY_REQUESTED
        : AUDIT_ACTIONS.POST_PUBLISH_MANUAL_REQUESTED,
    targetId: postId,
    metadata: {
      previousStatus: existingPost.status,
      requestedStatus: SocialPostStatus.PUBLISHING,
      mode: "manual",
      platform: SocialPlatform.FACEBOOK,
      confirmImmediate,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
    targetId: postId,
    metadata: {
      previousStatus: existingPost.status,
      nextStatus: SocialPostStatus.PUBLISHING,
      mode: "manual",
      platform: SocialPlatform.FACEBOOK,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
    targetId: postId,
    metadata: {
      previousStatus: existingPost.status,
      nextStatus: SocialPostStatus.PUBLISHING,
      mode: "manual",
    },
  });

  try {
    const result = await executeFacebookPublish({
      socialPostId: claim.socialPostId,
      socialPostPlatformId: claim.socialPostPlatformId,
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.PUBLISHED,
        mode: "manual",
        publishedAt: result.finishedAt.toISOString(),
        platform: SocialPlatform.FACEBOOK,
        platformPostId: result.result.platformPostId,
        platformPostUrl: result.result.platformPostUrl,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.PUBLISHED,
        mode: "manual",
      },
    });

    revalidatePostViews(postId);
    redirect("/dashboard/calendar");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook publishing failed.";

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
        platform: SocialPlatform.FACEBOOK,
        message,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
      },
    });

    revalidatePostViews(postId);
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message,
      }),
    );
  }
}
