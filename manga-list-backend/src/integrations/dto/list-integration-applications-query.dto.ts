import { IsIn, IsOptional } from 'class-validator';

export class ListIntegrationApplicationsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
