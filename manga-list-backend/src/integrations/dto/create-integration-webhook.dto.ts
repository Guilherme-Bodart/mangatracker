import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateIntegrationWebhookDto {
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'Webhook URL must be valid' })
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  signingSecret?: string;
}
