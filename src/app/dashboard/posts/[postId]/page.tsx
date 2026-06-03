import { notFound } from "next/navigation";
import { PostEditorForm } from "@/components/post-editor-form";
import { prisma } from "@/lib/prisma";

type PostDetailPageProps = {
  params: Promise<{
    postId: string;
  }>;
};

function toDateTimeLocalValue(date: Date | null) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { postId } = await params;
  const post = await prisma.socialPost.findUnique({
    where: { id: postId },
    include: {
      mediaAsset: true,
    },
  });

  if (!post) {
    notFound();
  }

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Edit Post</h2>
          <p>Status: {post.status}. Adjust draft/scheduled content and keep the data model ready for future publishing.</p>
        </div>
      </header>

      <PostEditorForm
        post={{
          id: post.id,
          internalTitle: post.internalTitle,
          caption: post.caption,
          scheduledAt: toDateTimeLocalValue(post.scheduledAt),
          status: post.status,
          mediaAsset: post.mediaAsset
            ? {
                id: post.mediaAsset.id,
                originalFilename: post.mediaAsset.originalFilename,
                mimeType: post.mediaAsset.mimeType,
                width: post.mediaAsset.width,
                height: post.mediaAsset.height,
                sizeBytes: post.mediaAsset.sizeBytes.toString(),
              }
            : null,
        }}
      />
    </section>
  );
}

