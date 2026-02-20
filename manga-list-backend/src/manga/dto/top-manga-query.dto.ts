import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

function parseBooleanQuery(value: unknown): unknown {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return value;
}

export class TopMangaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be greater than 0' })
  page = 1;

  @IsOptional()
  @Transform(({ value }) => parseBooleanQuery(value))
  @IsBoolean({ message: 'allowNsfw must be a boolean' })
  allowNsfw = false;
}
