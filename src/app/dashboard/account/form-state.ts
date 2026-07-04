import { initialFormState, type FormState } from "@/lib/validation";

export type AccountMfaFormState = FormState & {
  recoveryCodes?: string[];
};

export const initialAccountMfaFormState: AccountMfaFormState = {
  ...initialFormState,
  recoveryCodes: [],
};
