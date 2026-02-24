import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RotateIntegrationPartnerSecretDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientSecret?: string;
}
