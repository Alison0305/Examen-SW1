import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

type DtoConstructor<T> = new () => T;

export class DtoValidationPipe<T extends object> implements PipeTransform<unknown, T> {
  constructor(private readonly dto: DtoConstructor<T>) {}

  transform(value: unknown): T {
    const instance = plainToInstance(this.dto, value);
    const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) throw new BadRequestException();
    return instance;
  }
}
