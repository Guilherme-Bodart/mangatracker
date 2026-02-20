import { IsString, MinLength } from 'class-validator';
import { ApplyPasswordPolicy } from './password-policy';

export class ResetPasswordDto {
  @IsString()
  @MinLength(16, { message: 'Invalid reset token' })
  token!: string;

  @ApplyPasswordPolicy()
  password!: string;

  @IsString()
  @MinLength(8, { message: 'Password confirmation is required' })
  confirmPassword!: string;
}
