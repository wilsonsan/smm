import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PostsPage() {
  const posts = await prisma.socialPost.findMany({
    orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
    include: {
      platforms: true,
      mediaAsset: true,
    },
  });

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Posts</h2>
          <p>Drafts, scheduled content, and worker placeholders in one list.</p>
        </div>
        <Link href="/dashboard/posts/new" className="primary-button" style={{ display: "inline-flex", alignItems: "center" }}>
          New Post
        </Link>
      </header>

      <section className="panel">
        <div className="panel-body table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Platform</th>
                <th>Media</th>
              </tr>
            </thead>
            <tbody>
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No posts yet.
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link href={`/dashboard/posts/${post.id}`}>{post.internalTitle}</Link>
                    </td>
                    <td>
                      <span className="badge">{post.status}</span>
                    </td>
                    <td>{post.scheduledAt ? post.scheduledAt.toLocaleString() : "Not scheduled"}</td>
                    <td>{post.platforms.map((platform) => platform.platform).join(", ")}</td>
                    <td>{post.mediaAsset ? post.mediaAsset.originalFilename : "None"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

