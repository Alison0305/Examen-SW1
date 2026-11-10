import { Inject, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import type { MentorProposalResponse } from "./mentor-proposal.contracts";
import { toMentorProposalResponse } from "./mentor-proposal-response";
import { MENTOR_PROPOSAL_STORE, type MentorProposalStore } from "./mentor-proposal-store";

// CU-2P-06 detail (requireEdit). CU-2P-07 will have its own read projection with requireView.
@Injectable()
export class MentorProposalQueryService {
  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireEdit">,
    @Inject(MENTOR_PROPOSAL_STORE) private readonly store: MentorProposalStore,
    @Inject(ProjectsPersistenceService) private readonly projects: Pick<ProjectsPersistenceService, "findProject">,
  ) {}

  // Authorizes before revealing whether the proposal exists; the current revision only decides staleness.
  async get(projectId: string, proposalId: string, user: AuthenticatedUser): Promise<MentorProposalResponse | undefined> {
    await this.access.requireEdit(projectId, user.id);
    const proposal = await this.store.findByProjectAndId(projectId, proposalId);
    if (!proposal) return undefined;
    const project = await this.projects.findProject(projectId);
    if (!project) return undefined;
    return toMentorProposalResponse(proposal, project.revision);
  }
}
