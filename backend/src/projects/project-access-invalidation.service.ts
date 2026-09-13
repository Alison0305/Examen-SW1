import { Injectable } from "@nestjs/common";
import type { ProjectAccessRole } from "./project-access.service";

export type ProjectAccessInvalidation = {
  projectId: string;
  userId: string;
  accessRole: ProjectAccessRole;
};

@Injectable()
export class ProjectAccessInvalidationService {
  private readonly listeners = new Set<(invalidation: ProjectAccessInvalidation) => void>();

  subscribe(listener: (invalidation: ProjectAccessInvalidation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(invalidation: ProjectAccessInvalidation): void {
    for (const listener of this.listeners) listener(invalidation);
  }
}
