import {
  IsOptional,
  IsString,
  MinLength,
  IsUrl,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStaticImageUrl } from '../../common/validators/is-static-image-url.validator';
import { ApplyPasswordPolicy } from './password-policy';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(3)
  username?: string;

  @IsOptional()
  @ApplyPasswordPolicy()
  password?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  currentPassword?: string;

  @IsOptional()
  @IsUrl()
  @IsStaticImageUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsUrl()
  @IsStaticImageUrl()
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  allowNsfw?: boolean;
}
