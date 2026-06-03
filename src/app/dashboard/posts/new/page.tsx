import { PostEditorForm } from "@/components/post-editor-form";

export default function NewPostPage() {
  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>New Post</h2>
          <p>Draft a caption, attach media, and optionally schedule the first Facebook-ready record.</p>
        </div>
      </header>

      <PostEditorForm />
    </section>
  );
}

