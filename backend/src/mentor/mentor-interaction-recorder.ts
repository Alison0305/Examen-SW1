import { Injectable } from "@nestjs/common";
import type { MentorInteractionRecorder } from "./mentor.contracts";

// Persistence belongs to later second-partial use cases; this preserves the replacement boundary now.
@Injectable()
export class EphemeralMentorInteractionRecorder implements MentorInteractionRecorder {
  async record(): Promise<void> {}
}
