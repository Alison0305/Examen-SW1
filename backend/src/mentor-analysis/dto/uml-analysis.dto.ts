import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsDefined, IsIn, IsObject, isUUID, Validate, ValidateNested, type ValidationArguments, ValidatorConstraint, type ValidatorConstraintInterface } from "class-validator";
import { DtoValidationPipe } from "../../auth/dto/dto-validation.pipe";
import type { UmlAnalysisFocus } from "../uml-analysis-fragment";

// CU-2P-04: body of POST /projects/:id/mentor/analysis. It carries only the focus; the model, the user, the
// revision and any prompt come from the server. Unknown properties are rejected by DtoValidationPipe
// (whitelist + forbidNonWhitelisted), including at the nested level.

export const UML_ANALYSIS_FOCUS_KINDS = ["class", "relationship", "model"] as const;
export type UmlAnalysisFocusKind = (typeof UML_ANALYSIS_FOCUS_KINDS)[number];

// `id` depends on `kind`: a UUID for class and relationship, absent for model. @ValidateIf would switch off every
// validator of the property at once, so both rules live in one constraint.
@ValidatorConstraint({ name: "focusIdMatchesKind" })
export class FocusIdMatchesKind implements ValidatorConstraintInterface {
  validate(id: unknown, args: ValidationArguments): boolean {
    const kind = (args.object as Partial<UmlAnalysisFocusDto>).kind;
    if (kind === "model") return id === undefined;
    return typeof id === "string" && isUUID(id);
  }

  defaultMessage(): string {
    return "focus.id debe ser un UUID para class y relationship, y no debe enviarse para model.";
  }
}

export class UmlAnalysisFocusDto {
  @IsIn(UML_ANALYSIS_FOCUS_KINDS)
  kind!: UmlAnalysisFocusKind;

  @Validate(FocusIdMatchesKind)
  id?: string;
}

export class UmlAnalysisDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => UmlAnalysisFocusDto)
  focus!: UmlAnalysisFocusDto;
}

// The shared DtoValidationPipe throws a TypeError (HTTP 500) when the body is undefined or null, because
// class-validator cannot validate a missing object. A body that is not an object is rejected here with 400 before
// delegating to it; the shared pipe is left unchanged.
export class UmlAnalysisBodyPipe implements PipeTransform<unknown, UmlAnalysisDto> {
  private readonly validation = new DtoValidationPipe(UmlAnalysisDto);

  transform(value: unknown): UmlAnalysisDto {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException();
    return this.validation.transform(value);
  }
}

// Validated DTO → internal focus, without casts. The id check only repeats what the DTO already guaranteed.
export function toUmlAnalysisFocus(dto: UmlAnalysisDto): UmlAnalysisFocus {
  const { kind, id } = dto.focus;
  if (kind === "model") return { kind: "model" };
  if (id === undefined) throw new BadRequestException();
  return { kind, id };
}
