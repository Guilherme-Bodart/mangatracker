import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  loginMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  trackLoginMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: mocks.pushMock }),
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ login: mocks.loginMock }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}));

vi.mock("@/components/analytics/google-analytics-events", () => ({
  trackLogin: mocks.trackLoginMock,
}));

import { LoginForm } from "@/components/auth/login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits credentials and redirects on success", async () => {
    mocks.loginMock.mockResolvedValueOnce(undefined);

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("emailParams.label"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("passwordParams.label"), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mocks.loginMock).toHaveBeenCalledWith(
        "user@example.com",
        "Password123!",
      ),
    );
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith("success", {
      description: "successDescription",
    });
    expect(mocks.trackLoginMock).toHaveBeenCalledWith("email_password");
    expect(mocks.pushMock).toHaveBeenCalledWith("/my-track");
  });

  it("shows error toast when login fails", async () => {
    mocks.loginMock.mockRejectedValueOnce(new Error("Invalid credentials"));

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("emailParams.label"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("passwordParams.label"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mocks.toastErrorMock).toHaveBeenCalledWith("error", {
        description: "Invalid credentials",
      }),
    );
    expect(mocks.trackLoginMock).not.toHaveBeenCalled();
    expect(mocks.pushMock).not.toHaveBeenCalled();
  });
});
