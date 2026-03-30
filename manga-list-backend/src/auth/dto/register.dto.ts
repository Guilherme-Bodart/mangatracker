import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApplyPasswordPolicy } from './password-policy';

export class RegisterDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  username!: string;

  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @ApplyPasswordPolicy()
  password!: string;
}
