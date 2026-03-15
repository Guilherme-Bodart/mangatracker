import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RotateIntegrationPartnerSecretDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientSecret?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  transitionWindowHours?: number;
}
