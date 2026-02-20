import { describe, expect, it } from "vitest";

import {
  buildProfileUpdatePayload,
  hasPasswordMismatch,
  type ProfileFormData,
} from "@/lib/profile-update";

const baseForm: ProfileFormData = {
  username: "guilherme",
  avatarUrl: "https://cdn.test/avatar.png",
  bannerUrl: "https://cdn.test/banner.png",
  allowNsfw: false,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

describe("profile update helpers", () => {
  it("detects password mismatch only when new password is present", () => {
    expect(
      hasPasswordMismatch({
        ...baseForm,
        newPassword: "Password123!",
        confirmPassword: "Different123!",
      }),
    ).toBe(true);

    expect(
      hasPasswordMismatch({
        ...baseForm,
        newPassword: "",
        confirmPassword: "anything",
      }),
    ).toBe(false);
  });

  it("builds payload with only changed fields", () => {
    const payload = buildProfileUpdatePayload(
      {
        ...baseForm,
        username: "new-user",
        allowNsfw: true,
      },
      {
        username: "guilherme",
        avatarUrl: "https://cdn.test/avatar.png",
        bannerUrl: "https://cdn.test/banner.png",
        allowNsfw: false,
      },
    );

    expect(payload).toEqual({
      username: "new-user",
      allowNsfw: true,
    });
  });

  it("includes password and trimmed currentPassword when changing password", () => {
    const payload = buildProfileUpdatePayload(
      {
        ...baseForm,
        newPassword: "NewPass123!",
        confirmPassword: "NewPass123!",
        currentPassword: "  CurrentPass123!  ",
      },
      {
        username: "guilherme",
        avatarUrl: "https://cdn.test/avatar.png",
        bannerUrl: "https://cdn.test/banner.png",
        allowNsfw: false,
      },
    );

    expect(payload).toEqual({
      password: "NewPass123!",
      currentPassword: "CurrentPass123!",
    });
  });

  it("returns empty payload when no field changed", () => {
    const payload = buildProfileUpdatePayload(baseForm, {
      username: "guilherme",
      avatarUrl: "https://cdn.test/avatar.png",
      bannerUrl: "https://cdn.test/banner.png",
      allowNsfw: false,
    });

    expect(payload).toEqual({});
  });
});
