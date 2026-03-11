import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectIntegrationApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
