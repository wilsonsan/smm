"use client";

import { useActionState, useMemo, useState } from "react";
import { saveHashtagSettingsAction } from "@/app/dashboard/settings/actions";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";
import type { HashtagGroup } from "@/lib/hashtags";

type HashtagSettingsPanelProps = {
  initialValues: {
    facebookDefaultLimit: number;
    groups: HashtagGroup[];
  };
};

function parseGroupEditorText(value: string) {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createDraftGroup(): HashtagGroup {
  const fallbackId = `group-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: globalThis.crypto?.randomUUID?.() ?? fallbackId,
    name: "",
    hashtags: [],
  };
}

export function HashtagSettingsPanel({ initialValues }: HashtagSettingsPanelProps) {
  const [state, formAction] = useActionState(saveHashtagSettingsAction, initialFormState);
  const [facebookDefaultLimit, setFacebookDefaultLimit] = useState(String(initialValues.facebookDefaultLimit));
  const [groups, setGroups] = useState<HashtagGroup[]>(initialValues.groups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialValues.groups[0]?.id ?? null);
  const [groupEditorText, setGroupEditorText] = useState(
    initialValues.groups[0]?.hashtags.join(", ") ?? "",
  );

  const groupsWithDraftEditor = useMemo(
    () =>
      groups.map((group) =>
        group.id === selectedGroupId
          ? {
              ...group,
              hashtags: parseGroupEditorText(groupEditorText),
            }
          : group,
      ),
    [groupEditorText, groups, selectedGroupId],
  );

  const groupsJson = useMemo(
    () =>
      JSON.stringify(
        groupsWithDraftEditor.map((group) => ({
          id: group.id,
          name: group.name,
          hashtags: group.hashtags,
        })),
      ),
    [groupsWithDraftEditor],
  );

  const selectedGroup =
    groupsWithDraftEditor.find((group) => group.id === selectedGroupId) ?? groupsWithDraftEditor[0] ?? null;

  function updateGroup(groupId: string, updater: (current: HashtagGroup) => HashtagGroup) {
    setGroups((current) => current.map((entry) => (entry.id === groupId ? updater(entry) : entry)));
  }

  function commitCurrentEditorToGroup(targetGroupId = selectedGroupId) {
    if (!targetGroupId) {
      return;
    }

    const parsedHashtags = parseGroupEditorText(groupEditorText);
    setGroups((current) =>
      current.map((entry) =>
        entry.id === targetGroupId
          ? {
              ...entry,
              hashtags: parsedHashtags,
            }
          : entry,
      ),
    );
  }

  function handleAddGroup() {
    commitCurrentEditorToGroup();
    const draft = createDraftGroup();
    setGroups((current) => [...current, draft]);
    setSelectedGroupId(draft.id);
    setGroupEditorText("");
  }

  function handleRemoveGroup(groupId: string) {
    commitCurrentEditorToGroup();
    const nextValues = groups.filter((entry) => entry.id !== groupId);
    setGroups(nextValues);
    if (selectedGroupId === groupId) {
      const nextSelectedGroup = nextValues[0] ?? null;
      setSelectedGroupId(nextSelectedGroup?.id ?? null);
      setGroupEditorText(nextSelectedGroup ? nextSelectedGroup.hashtags.join(", ") : "");
    }
  }

  return (
    <form action={formAction} className="panel settings-section-card">
      <div className="settings-section-head">
        <div>
          <span className="settings-eyebrow">Composer Controls</span>
          <h3>Hashtags</h3>
          <p>Manage reusable hashtag groups and the default number of hashtags Facebook should append to posts.</p>
        </div>
        <span className="settings-count">{groups.length} groups</span>
      </div>

      <section className="settings-subcard">
        <div className="settings-subcard-head">
          <div>
            <strong>Reusable Hashtag Groups</strong>
            <p>Pick a group on the left, then edit the group name and hashtag list on the right.</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={handleAddGroup}
          >
            Add Group
          </button>
        </div>

        <div className="template-variable-workspace">
          <div className="template-variable-library">
            {groupsWithDraftEditor.length > 0 ? (
              <div className="template-variable-library-list">
                {groupsWithDraftEditor.map((group, index) => {
                  const isActive = selectedGroup?.id === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={`template-variable-library-item${isActive ? " is-active" : ""}`.trim()}
                      onClick={() => {
                        commitCurrentEditorToGroup();
                        setSelectedGroupId(group.id);
                        setGroupEditorText(group.hashtags.join(", "));
                      }}
                    >
                      <span className="template-variable-library-index">{index + 1}</span>
                      <div className="template-variable-library-copy">
                        <strong>{group.name.trim() || "Untitled group"}</strong>
                        <span>
                          {group.hashtags.length} hashtag{group.hashtags.length === 1 ? "" : "s"}
                        </span>
                        <small>{group.hashtags.length > 0 ? group.hashtags.map((tag) => `#${tag}`).join(", ") : "No hashtags added yet"}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="template-variable-empty-state">
                <strong>No groups yet</strong>
                <p>Add your first reusable hashtag group to make the composer faster to use.</p>
              </div>
            )}
          </div>

          <div className="template-variable-editor">
            {selectedGroup ? (
              <article className="template-variable-editor-card">
                <div className="template-variable-editor-head">
                  <div>
                    <strong>{selectedGroup.name.trim() || "Untitled group"}</strong>
                    <p>Separate hashtags with commas or new lines. Save them without the <code>#</code> if you want.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-link-button"
                    onClick={() => handleRemoveGroup(selectedGroup.id)}
                  >
                    Delete
                  </button>
                </div>

                <div className="field">
                  <label>Group name</label>
                  <input
                    value={selectedGroup.name}
                    onChange={(event) =>
                      updateGroup(selectedGroup.id, (current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Bathrooms"
                  />
                </div>

                <div className="field">
                  <label>Hashtags</label>
                  <textarea
                    value={groupEditorText}
                    onChange={(event) => {
                      setGroupEditorText(event.target.value);
                    }}
                    onBlur={() => commitCurrentEditorToGroup(selectedGroup.id)}
                    placeholder="customshower, tileinstallation, raleighnc"
                    rows={8}
                  />
                  <span className="hint">Example output: #customshower #tileinstallation #raleighnc</span>
                </div>
              </article>
            ) : (
              <div className="template-variable-empty-state">
                <strong>Select a group</strong>
                <p>Choose a hashtag group from the library or add a new one to edit it here.</p>
              </div>
            )}
          </div>
        </div>

        <input type="hidden" name="facebookDefaultLimit" value={facebookDefaultLimit} />
        <input type="hidden" name="groupsJson" value={groupsJson} />
        {state.fieldErrors?.facebookDefaultLimit?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
        {state.fieldErrors?.groupsJson?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </section>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="primary-button">Save Hashtag Settings</SubmitButton>
      </div>
    </form>
  );
}
