export type ProfileFormData = {
  username: string;
  avatarUrl: string;
  bannerUrl: string;
  allowNsfw: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ProfileSnapshot = {
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  allowNsfw?: boolean;
};

export function hasPasswordMismatch(formData: ProfileFormData): boolean {
  return (
    !!formData.newPassword && formData.newPassword !== formData.confirmPassword
  );
}

export function buildProfileUpdatePayload(
  formData: ProfileFormData,
  user: ProfileSnapshot,
): Record<string, string | boolean> {
  const payload: Record<string, string | boolean> = {};

  if (formData.username !== user.username) {
    payload.username = formData.username;
  }
  if (formData.avatarUrl !== (user.avatarUrl || "")) {
    payload.avatarUrl = formData.avatarUrl;
  }
  if (formData.bannerUrl !== (user.bannerUrl || "")) {
    payload.bannerUrl = formData.bannerUrl;
  }
  if (formData.allowNsfw !== (user.allowNsfw || false)) {
    payload.allowNsfw = formData.allowNsfw;
  }

  if (formData.newPassword) {
    payload.password = formData.newPassword;
    const currentPassword = formData.currentPassword.trim();
    if (currentPassword) {
      payload.currentPassword = currentPassword;
    }
  }

  return payload;
}
