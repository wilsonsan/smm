import Link from "next/link";
import { SocialPostStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const [totalPosts, scheduledPosts, draftPosts, recentPosts] = await Promise.all([
    prisma.socialPost.count(),
    prisma.socialPost.count({
      where: { status: SocialPostStatus.SCHEDULED },
    }),
    prisma.socialPost.count({
      where: { status: SocialPostStatus.DRAFT },
    }),
    prisma.socialPost.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        platforms: true,
      },
    }),
  ]);

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Foundational control center for content planning, uploads, and future publishing workers.</p>
        </div>

        <Link href="/dashboard/posts/new" className="primary-button" style={{ display: "inline-flex", alignItems: "center" }}>
          New Post
        </Link>
      </header>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Total posts</span>
          <strong>{totalPosts}</strong>
        </article>
        <article className="stat-card">
          <span>Scheduled</span>
          <strong>{scheduledPosts}</strong>
        </article>
        <article className="stat-card">
          <span>Drafts</span>
          <strong>{draftPosts}</strong>
        </article>
        <article className="stat-card">
          <span>Worker mode</span>
          <strong>Placeholder</strong>
        </article>
      </div>

      <section className="panel">
        <div className="panel-body">
          <div className="page-header">
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Recent Posts</h2>
              <p>Latest drafts and scheduled content.</p>
            </div>
            <Link href="/dashboard/posts" className="secondary-button" style={{ display: "inline-flex", alignItems: "center" }}>
              View All
            </Link>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Platform</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No posts yet.
                    </td>
                  </tr>
                ) : (
                  recentPosts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <Link href={`/dashboard/posts/${post.id}`}>{post.internalTitle}</Link>
                      </td>
                      <td>
                        <span className="badge">{post.status}</span>
                      </td>
                      <td>{post.scheduledAt ? post.scheduledAt.toLocaleString() : "Not scheduled"}</td>
                      <td>{post.platforms.map((platform) => platform.platform).join(", ") || "FACEBOOK"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

