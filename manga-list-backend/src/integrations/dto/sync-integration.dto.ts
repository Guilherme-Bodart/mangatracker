import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SyncIntegrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  partnerSlug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalMangaId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsInt()
  @Min(0)
  chapter!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceDomain?: string;
}
