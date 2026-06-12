"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearGalleryLibraryAction } from "@/app/dashboard/settings/actions";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

type DeletionSettingsPanelProps = {
  mediaAssetCount: number;
};

export function DeletionSettingsPanel({ mediaAssetCount }: DeletionSettingsPanelProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(clearGalleryLibraryAction, initialFormState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <section className="panel settings-section-card">
      <div className="settings-section-head">
        <div>
          <span className="settings-eyebrow">Deletion & Recovery</span>
          <h3>Gallery Reset</h3>
          <p>Use this only when the gallery is out of sync with disk storage and you want to start the media library over cleanly.</p>
        </div>
        <span className="settings-count">Destructive</span>
      </div>

      <section className="settings-subcard settings-danger-subcard">
        <div className="settings-subcard-head">
          <div>
            <strong>Clear Gallery Library</strong>
            <p>
              This permanently removes all saved gallery media records and tries to delete any remaining gallery image
              files from disk. Existing posts will keep their post history, but attached gallery images will be cleared.
            </p>
          </div>
          <span className="settings-chip settings-chip-danger">{mediaAssetCount} saved items</span>
        </div>

        <div className="settings-danger-callout">
          <strong>Before you clear it</strong>
          <p>
            Use this recovery tool after rebuilds, storage wipes, or broken uploads where the database still shows images
            that are no longer on disk.
          </p>
        </div>

        <form action={formAction} className="form-grid">
          <div className="field">
            <label htmlFor="galleryDeletionConfirmation">Type CLEAR GALLERY to confirm</label>
            <input
              id="galleryDeletionConfirmation"
              name="confirmation"
              placeholder="CLEAR GALLERY"
              autoComplete="off"
              disabled={isPending}
            />
            <span className="hint">This cannot be undone.</span>
            {state.fieldErrors?.confirmation?.map((error) => (
              <span key={error} className="error-text">
                {error}
              </span>
            ))}
          </div>

          {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

          <div className="button-row">
            <SubmitButton className="danger-button" disabled={isPending || mediaAssetCount === 0}>
              {isPending ? "Clearing Gallery..." : mediaAssetCount === 0 ? "Gallery Already Empty" : "Clear Gallery"}
            </SubmitButton>
          </div>
        </form>
      </section>
    </section>
  );
}
