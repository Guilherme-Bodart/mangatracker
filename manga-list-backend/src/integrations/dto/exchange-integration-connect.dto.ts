import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ExchangeIntegrationConnectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  partnerSlug!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  clientSecret?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceDomain?: string;
}
