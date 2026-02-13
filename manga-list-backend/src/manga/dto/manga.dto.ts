import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export interface JikanMangaSearchResult {
  mal_id: number;
  title: string;
  title_english?: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
  authors?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
  explicit_genres?: Array<{ name: string }>;
  themes?: Array<{ name: string }>;
  demographics?: Array<{ name: string }>;
  rating?: string;
  chapters?: number;
  synopsis?: string;
  score?: number;
  scored_by?: number;
}

export interface JikanSearchResponse {
  data: JikanMangaSearchResult[];
  pagination: {
    has_next_page: boolean;
    current_page: number;
    last_visible_page: number;
  };
}

export interface MangaSearchDto {
  query: string;
  page?: number;
  limit?: number;
}

export enum MangaListStatus {
  READING = 'READING',
  COMPLETED = 'COMPLETED',
  PLAN_TO_READ = 'PLAN_TO_READ',
  DROPPED = 'DROPPED',
}

export class AddMangaToListDto {
  @IsInt()
  @Min(1)
  malId!: number;

  @IsEnum(MangaListStatus)
  status!: MangaListStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentChapter?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}

export class UpdateMangaListDto {
  @IsOptional()
  @IsEnum(MangaListStatus)
  status?: MangaListStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentChapter?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
