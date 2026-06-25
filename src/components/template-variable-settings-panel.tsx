"use client";

import { useActionState, useMemo, useState } from "react";
import { saveTemplateVariablesAction } from "@/app/dashboard/settings/actions";
import { SubmitButton } from "@/components/submit-button";
import { deriveTemplateVariableFormatFromName } from "@/lib/template-variables";
import { initialFormState } from "@/lib/validation";
import type { TemplateVariableDefinition } from "@/lib/template-variables";

type TemplateVariableSettingsPanelProps = {
  initialValues: TemplateVariableDefinition[];
};

function createDraftVariable(): TemplateVariableDefinition {
  const fallbackId = `variable-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: globalThis.crypto?.randomUUID?.() ?? fallbackId,
    name: "",
    format: "",
    outcome: "",
  };
}

export function TemplateVariableSettingsPanel({ initialValues }: TemplateVariableSettingsPanelProps) {
  const [state, formAction] = useActionState(saveTemplateVariablesAction, initialFormState);
  const [variables, setVariables] = useState<TemplateVariableDefinition[]>(initialValues);
  const [selectedVariableId, setSelectedVariableId] = useState<string | null>(initialValues[0]?.id ?? null);

  const templateVariablesJson = useMemo(
    () =>
      JSON.stringify(
        variables.map((variable) => ({
          id: variable.id,
          name: variable.name,
          format: variable.format,
          outcome: variable.outcome,
        })),
      ),
    [variables],
  );

  const selectedVariable =
    variables.find((variable) => variable.id === selectedVariableId) ?? variables[0] ?? null;

  function updateVariable(variableId: string, updater: (current: TemplateVariableDefinition) => TemplateVariableDefinition) {
    setVariables((current) => current.map((entry) => (entry.id === variableId ? updater(entry) : entry)));
  }

  function shouldAutoSyncVariableFormat(variable: TemplateVariableDefinition) {
    const currentFormat = variable.format.trim();
    const derivedFromCurrentName = deriveTemplateVariableFormatFromName(variable.name);

    return (
      !currentFormat ||
      currentFormat === "{{newVariable}}" ||
      (Boolean(derivedFromCurrentName) && currentFormat === derivedFromCurrentName)
    );
  }

  function handleAddVariable() {
    const draft = createDraftVariable();
    setVariables((current) => [...current, draft]);
    setSelectedVariableId(draft.id);
  }

  function handleRemoveVariable(variableId: string) {
    const nextValues = variables.filter((entry) => entry.id !== variableId);
    setVariables(nextValues);
    if (selectedVariableId === variableId) {
      setSelectedVariableId(nextValues[0]?.id ?? null);
    }
  }

  return (
    <form action={formAction} className="panel settings-section-card">
      <div className="settings-section-head">
        <div>
          <span className="settings-eyebrow">Post Templates</span>
          <h3>Template Variables</h3>
          <p>Manage the reusable variables inserted into post descriptions, overrides, and Instagram first comments.</p>
        </div>
        <span className="settings-count">{variables.length} variables</span>
      </div>

      <section className="settings-subcard">
        <div className="settings-subcard-head">
          <div>
            <strong>Variable Library</strong>
            <p>Pick a variable on the left, then edit its label, token, and resolved outcome on the right.</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={handleAddVariable}
          >
            Add Variable
          </button>
        </div>

        <div className="template-variable-workspace">
          <div className="template-variable-library">
            {variables.length > 0 ? (
              <div className="template-variable-library-list">
                {variables.map((variable, index) => {
                  const isActive = selectedVariable?.id === variable.id;
                  return (
                    <button
                      key={variable.id}
                      type="button"
                      className={`template-variable-library-item${isActive ? " is-active" : ""}`.trim()}
                      onClick={() => setSelectedVariableId(variable.id)}
                    >
                      <span className="template-variable-library-index">{index + 1}</span>
                      <div className="template-variable-library-copy">
                        <strong>{variable.name.trim() || "Untitled variable"}</strong>
                        <span>{variable.format.trim() || "{{newVariable}}"}</span>
                        <small>{variable.outcome.trim() || "No default outcome set yet"}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="template-variable-empty-state">
                <strong>No variables yet</strong>
                <p>Add your first reusable variable to start filling descriptions faster.</p>
              </div>
            )}
          </div>

          <div className="template-variable-editor">
            {selectedVariable ? (
              <article className="template-variable-editor-card">
                <div className="template-variable-editor-head">
                  <div>
                    <strong>{selectedVariable.name.trim() || "Untitled variable"}</strong>
                    <p>Leave the outcome blank if this variable should block Schedule or Post Now until a value is provided.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-link-button"
                    onClick={() => handleRemoveVariable(selectedVariable.id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Name</label>
                    <input
                      value={selectedVariable.name}
                      onChange={(event) =>
                        updateVariable(selectedVariable.id, (current) => {
                          const nextName = event.target.value;
                          const nextVariable = { ...current, name: nextName };

                          if (shouldAutoSyncVariableFormat(current)) {
                            const autoFormat = deriveTemplateVariableFormatFromName(nextName);
                            nextVariable.format = autoFormat || current.format;
                          }

                          return nextVariable;
                        })
                      }
                      placeholder="Project Type"
                    />
                  </div>

                  <div className="field">
                    <label>Format</label>
                    <input
                      value={selectedVariable.format}
                      onChange={(event) =>
                        updateVariable(selectedVariable.id, (current) => ({ ...current, format: event.target.value }))
                      }
                      placeholder="{{projectType}}"
                    />
                    <span className="hint">Use a token like <code>{"{{projectType}}"}</code>.</span>
                  </div>
                </div>

                <div className="field">
                  <label>Outcome</label>
                  <textarea
                    value={selectedVariable.outcome}
                    onChange={(event) =>
                      updateVariable(selectedVariable.id, (current) => ({ ...current, outcome: event.target.value }))
                    }
                    rows={5}
                    placeholder="Custom shower"
                  />
                </div>
              </article>
            ) : (
              <div className="template-variable-empty-state">
                <strong>Select a variable</strong>
                <p>Choose a variable from the library or add a new one to edit it here.</p>
              </div>
            )}
          </div>
        </div>

        <input type="hidden" name="templateVariablesJson" value={templateVariablesJson} />
        {state.fieldErrors?.templateVariablesJson?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </section>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="primary-button">Save Template Variables</SubmitButton>
      </div>
    </form>
  );
}
