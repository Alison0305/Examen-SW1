import { Inject, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import type { MentorInteractionIdentity } from "./mentor-interaction-identity.contracts";

@Injectable()
export class MentorInteractionIdentityResolver {
  constructor(@Inject(ProjectAccessService) private readonly access: ProjectAccessService) {}

  async resolve(projectId: string, authenticatedUser: AuthenticatedUser): Promise<MentorInteractionIdentity> {
    const accessRole = await this.access.requireView(projectId, authenticatedUser.id);
    return { projectId, userId: authenticatedUser.id, author: { email: authenticatedUser.email }, accessRole, occurredAt: new Date() };
  }
}
