import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { PASSWORD_POLICY_MESSAGE } from './password-policy';

async function getValidationMessages<T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(dtoClass, payload);
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('Password policy DTO validation', () => {
  it('accepts valid password on register', async () => {
    const errors = await getValidationMessages(RegisterDto, {
      username: 'valid-user',
      email: 'user@example.com',
      password: 'StrongPass123',
    });

    expect(errors).not.toContain(PASSWORD_POLICY_MESSAGE);
  });

  it('rejects short password on register', async () => {
    const errors = await getValidationMessages(RegisterDto, {
      username: 'valid-user',
      email: 'user@example.com',
      password: 'Str0ng1',
    });

    expect(errors).toContain(PASSWORD_POLICY_MESSAGE);
  });

  it('rejects weak password without uppercase on reset', async () => {
    const errors = await getValidationMessages(ResetPasswordDto, {
      token: '1234567890123456',
      password: 'strongpass123',
      confirmPassword: 'strongpass123',
    });

    expect(errors).toContain(PASSWORD_POLICY_MESSAGE);
  });

  it('rejects weak password without number on profile update', async () => {
    const errors = await getValidationMessages(UpdateProfileDto, {
      password: 'StrongPassword',
      currentPassword: 'oldpwd',
    });

    expect(errors).toContain(PASSWORD_POLICY_MESSAGE);
  });

  it('allows profile update without password field', async () => {
    const errors = await getValidationMessages(UpdateProfileDto, {
      username: 'new-name',
    });

    expect(errors).toHaveLength(0);
  });
});
