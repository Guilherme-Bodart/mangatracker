import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateIntegrationApplicationDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(100)
  requestedSlug!: string;

  @IsString()
  @IsEmail()
  @MaxLength(320)
  contactEmail!: string;

  @IsString()
  @IsUrl({
    require_tld: true,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  @MaxLength(300)
  siteUrl!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  useCase?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captchaToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
