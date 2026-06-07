export type UserManagementFormState = {
  success: boolean;
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialUserManagementFormState: UserManagementFormState = {
  success: false,
  message: null,
};
