import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';

export class SubmitApplicationDto {
  @IsString()
  @MinLength(1)
  org: string;

  @IsString()
  @MinLength(1)
  jobTitle: string;

  @IsString()
  @MinLength(1)
  contact: string;

  @IsIn(['employment', 'faculty_id', 'appointment', 'other'])
  docType: string;

  @IsString()
  @MinLength(1)
  docName: string;

  @IsInt()
  @Min(0)
  docSize: number;

  @IsString()
  @MinLength(1)
  docData: string;
}
