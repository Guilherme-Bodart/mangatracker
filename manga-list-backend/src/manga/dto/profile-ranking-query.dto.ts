import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ProfileRankingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be greater than 0' })
  @Max(100, { message: 'limit must be less than or equal to 100' })
  limit = 100;
}
