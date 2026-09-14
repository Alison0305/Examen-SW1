export type SpringGeneratorConfig = Readonly<{
  groupId: string;
  artifactId: string;
  basePackage: string;
  applicationClass: string;
}>;

export const defaultSpringGeneratorConfig: SpringGeneratorConfig = Object.freeze({
  groupId: "com.examen.sw1",
  artifactId: "generated-backend",
  basePackage: "com.examen.sw1.generated",
  applicationClass: "GeneratedApplication",
});

export type GeneratedFile = Readonly<{ path: string; content: string }>;
