import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const INTEGRATION_PARTNER_PARSER_MODES = [
  'generic',
  'mangalivre',
  'seriesSlugNumberPath',
  'singleSlugNumberPath',
] as const;

export class CreateIntegrationPartnerDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(100)
  slug!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientSecret?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsString()
  @IsIn(INTEGRATION_PARTNER_PARSER_MODES)
  parserMode?: (typeof INTEGRATION_PARTNER_PARSER_MODES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  parserTitleSelectors?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  parserChapterSelectors?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
