import type { ProjectAccessRole } from "../projects/project-access.service";

export type MentorInteractionIdentity = Readonly<{
  projectId: string;
  userId: string;
  author: Readonly<{
    email: string;
  }>;
  accessRole: Exclude<ProjectAccessRole, "NONE">;
  occurredAt: Date;
}>;
