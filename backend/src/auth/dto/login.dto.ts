import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
