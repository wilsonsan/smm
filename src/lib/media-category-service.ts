import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getExistingMediaCategoriesByIds(categoryIds: string[]) {
  if (categoryIds.length === 0) {
    return [];
  }

  return prisma.mediaCategory.findMany({
    where: {
      id: {
        in: categoryIds,
      },
    },
    orderBy: {
      sortOrder: "asc",
    },
  });
}

export async function replaceMediaAssetCategories(mediaAssetId: string, categoryIds: string[]) {
  await prisma.mediaAssetCategory.deleteMany({
    where: {
      mediaAssetId,
    },
  });

  if (categoryIds.length === 0) {
    return [];
  }

  await prisma.mediaAssetCategory.createMany({
    data: categoryIds.map((mediaCategoryId) => ({
      mediaAssetId,
      mediaCategoryId,
    })),
    skipDuplicates: true,
  });

  return prisma.mediaAssetCategory.findMany({
    where: {
      mediaAssetId,
    },
    include: {
      mediaCategory: true,
    },
    orderBy: {
      mediaCategory: {
        sortOrder: "asc",
      },
    },
  });
}

export async function assignMediaAssetCategories(mediaAssetId: string, categoryIds: string[]) {
  if (categoryIds.length === 0) {
    return prisma.mediaAssetCategory.findMany({
      where: {
        mediaAssetId,
      },
      include: {
        mediaCategory: true,
      },
      orderBy: {
        mediaCategory: {
          sortOrder: "asc",
        },
      },
    });
  }

  await prisma.mediaAssetCategory.createMany({
    data: categoryIds.map((mediaCategoryId) => ({
      mediaAssetId,
      mediaCategoryId,
    })),
    skipDuplicates: true,
  });

  return prisma.mediaAssetCategory.findMany({
    where: {
      mediaAssetId,
    },
    include: {
      mediaCategory: true,
    },
    orderBy: {
      mediaCategory: {
        sortOrder: "asc",
      },
    },
  });
}

export async function updateMediaAssetCategoriesBulk(input: {
  mediaAssetIds: string[];
  categoryIds: string[];
  mode: "assign" | "replace" | "clear";
}) {
  if (input.mode === "clear") {
    await prisma.mediaAssetCategory.deleteMany({
      where: {
        mediaAssetId: {
          in: input.mediaAssetIds,
        },
      },
    });

    return;
  }

  if (input.mode === "replace") {
    await prisma.mediaAssetCategory.deleteMany({
      where: {
        mediaAssetId: {
          in: input.mediaAssetIds,
        },
      },
    });
  }

  if (input.categoryIds.length === 0) {
    return;
  }

  const rows = input.mediaAssetIds.flatMap((mediaAssetId) =>
    input.categoryIds.map((mediaCategoryId) => ({
      mediaAssetId,
      mediaCategoryId,
    })),
  );

  await prisma.mediaAssetCategory.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

export function normalizeCategoryIdList(categoryIds: string[]) {
  return [...new Set(categoryIds.map((id) => id.trim()).filter(Boolean))];
}

export function normalizeJsonPayload<T>(payload: unknown) {
  return payload as T;
}
