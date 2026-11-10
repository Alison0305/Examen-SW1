import type { ProjectOperationAck } from "./realtime.contracts";

export const PROJECT_OPERATION_BROADCASTER = Symbol("PROJECT_OPERATION_BROADCASTER");

// Emits an authoritative ACCEPTED operation to the project's room, exactly as an editor operation does.
// Implemented by ProjectRealtimeGateway; callers outside the gateway (CU-2P-06) emit only after an ACCEPTED result.
export interface ProjectOperationBroadcaster {
  broadcastAccepted(ack: ProjectOperationAck): void;
}
