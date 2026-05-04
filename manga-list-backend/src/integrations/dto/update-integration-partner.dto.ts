import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const INTEGRATION_PARTNER_PARSER_MODES = [
  'generic',
  'mangalivre',
  'seriesSlugNumberPath',
  'singleSlugNumberPath',
] as const;

export class UpdateIntegrationPartnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsString()
  @IsIn(INTEGRATION_PARTNER_PARSER_MODES)
  parserMode?: (typeof INTEGRATION_PARTNER_PARSER_MODES)[number] | null;

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
