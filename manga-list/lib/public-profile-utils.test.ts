import { describe, expect, it } from "vitest";
import {
  formatRating,
  getStatusColor,
  getUsernameFromPathname,
  resolveSafeCoverImage,
} from "@/lib/public-profile-utils";

describe("public-profile-utils", () => {
  describe("getUsernameFromPathname", () => {
    it("reads username from localized and non-localized paths", () => {
      expect(getUsernameFromPathname("/user/guilherme")).toBe("guilherme");
      expect(getUsernameFromPathname("/pt/user/guilherme")).toBe("guilherme");
    });

    it("decodes URI encoded usernames", () => {
      expect(getUsernameFromPathname("/user/Guilherme%20Bodart")).toBe(
        "Guilherme Bodart",
      );
    });

    it("returns empty string when path does not contain user segment", () => {
      expect(getUsernameFromPathname("/ranking")).toBe("");
      expect(getUsernameFromPathname("/user")).toBe("");
    });
  });

  describe("resolveSafeCoverImage", () => {
    it("returns fallback for empty or invalid values", () => {
      expect(resolveSafeCoverImage("", "/fallback.png")).toBe("/fallback.png");
      expect(resolveSafeCoverImage("invalid-url", "/fallback.png")).toBe(
        "/fallback.png",
      );
    });

    it("keeps valid urls", () => {
      expect(
        resolveSafeCoverImage("https://example.com/cover.jpg", "/fallback.png"),
      ).toBe("https://example.com/cover.jpg");
    });
  });

  describe("status and rating helpers", () => {
    it("maps known statuses and falls back for unknown", () => {
      expect(getStatusColor("READING")).toBe("bg-blue-500");
      expect(getStatusColor("COMPLETED")).toBe("bg-green-500");
      expect(getStatusColor("UNKNOWN")).toBe("bg-gray-500");
    });

    it("formats integer and decimal ratings", () => {
      expect(formatRating(7)).toBe("7");
      expect(formatRating(7.25)).toBe("7.3");
    });
  });
});

