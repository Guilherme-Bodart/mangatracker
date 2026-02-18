import {
  IsOptional,
  IsString,
  MinLength,
  IsUrl,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStaticImageUrl } from '../../common/validators/is-static-image-url.validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
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
