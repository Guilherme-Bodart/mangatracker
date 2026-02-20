import { IsString, MinLength } from 'class-validator';

export class OAuthExchangeDto {
  @IsString()
  @MinLength(16, { message: 'Invalid exchange code' })
  code!: string;

  @IsString()
  @MinLength(40, { message: 'Invalid oauth state' })
  state!: string;
}
