import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  registerMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  trackSignUpMock: vi.fn(),
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
  useAuth: () => ({ register: mocks.registerMock }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}));

vi.mock("@/components/analytics/google-analytics-events", () => ({
  trackSignUp: mocks.trackSignUpMock,
}));

import { RegisterForm } from "@/components/auth/register-form";

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks submit when passwords do not match", async () => {
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText("usernameParams.label"), {
      target: { value: "newuser" },
    });
    fireEvent.change(screen.getByLabelText("emailParams.label"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("passwordParams.label"), {
      target: { value: "Password123!" },
    });
    fireEvent.change(screen.getByLabelText("confirmPasswordParams.label"), {
      target: { value: "Different123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mocks.toastErrorMock).toHaveBeenCalledWith("error", {
        description: "passwordMismatch",
      }),
    );
    expect(mocks.trackSignUpMock).not.toHaveBeenCalled();
    expect(mocks.registerMock).not.toHaveBeenCalled();
    expect(mocks.pushMock).not.toHaveBeenCalled();
  });

  it("registers and redirects on success", async () => {
    mocks.registerMock.mockResolvedValueOnce(undefined);

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText("usernameParams.label"), {
      target: { value: "newuser" },
    });
    fireEvent.change(screen.getByLabelText("emailParams.label"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("passwordParams.label"), {
      target: { value: "Password123!" },
    });
    fireEvent.change(screen.getByLabelText("confirmPasswordParams.label"), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(mocks.registerMock).toHaveBeenCalledWith(
        "newuser",
        "new@example.com",
        "Password123!",
      ),
    );
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith("success", {
      description: "successDescription",
    });
    expect(mocks.trackSignUpMock).toHaveBeenCalledWith("email_password");
    expect(mocks.pushMock).toHaveBeenCalledWith("/my-track");
  });
});
