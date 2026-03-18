import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MaxLength(2000)
  message!: string;
}

