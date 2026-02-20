import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApplyPasswordPolicy } from './password-policy';

export class RegisterDto {
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  username!: string;

  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @ApplyPasswordPolicy()
  password!: string;
}
