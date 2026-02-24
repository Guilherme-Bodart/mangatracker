import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class StartIntegrationConnectDto {
  @IsString()
  @MaxLength(100)
  partnerSlug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceDomain?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  scopes?: string[];
}
