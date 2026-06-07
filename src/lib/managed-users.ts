import type { AdminUser } from "@prisma/client";

export const DELETED_USER_SETTING_KEY = "DELETED_USER_ADMIN_ID";
export const DELETED_USER_USERNAME = "deleted-user-archive";
export const DELETED_USER_EMAIL = "deleted-user@nctilepros.local";
export const DELETED_USER_DISPLAY_NAME = "Deleted User";

export function isDeletedArchiveUser(input: Pick<AdminUser, "username" | "email"> | null | undefined) {
  if (!input) {
    return false;
  }

  return input.username === DELETED_USER_USERNAME || input.email === DELETED_USER_EMAIL;
}
