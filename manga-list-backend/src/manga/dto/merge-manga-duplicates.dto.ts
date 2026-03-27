import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class MergeMangaDuplicatesDto {
  @IsUUID('4', { message: 'canonicalMangaId must be a UUID' })
  canonicalMangaId!: string;

  @IsArray({ message: 'duplicateMangaIds must be an array' })
  @ArrayMinSize(1, { message: 'duplicateMangaIds must include at least one id' })
  @IsUUID('4', {
    each: true,
    message: 'duplicateMangaIds must contain valid UUID values',
  })
  duplicateMangaIds!: string[];
}

