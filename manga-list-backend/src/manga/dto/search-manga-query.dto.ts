import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export enum MangaGenresMode {
  AND = 'AND',
  OR = 'OR',
}

export enum MangaSearchProvider {
  JIKAN = 'jikan',
  ANILIST = 'anilist',
}

function parseBooleanQuery(value: unknown): unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return value;
}

export class SearchMangaQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q = '';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be greater than 0' })
  page = 1;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .join(',')
      : value,
  )
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'genres must be comma-separated numeric ids',
  })
  genres?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(MangaGenresMode, { message: 'genresMode must be AND or OR' })
  genresMode: MangaGenresMode = MangaGenresMode.OR;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  type?: string;

  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean({ message: 'allowNsfw must be a boolean' })
  allowNsfw = false;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(MangaSearchProvider, {
    message: 'provider must be jikan or anilist',
  })
  provider: MangaSearchProvider = MangaSearchProvider.JIKAN;
}
