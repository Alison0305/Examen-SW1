export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export type ProjectAccessRole = "OWNER" | "EDITOR" | "VIEWER";
export type ProjectMemberRole = Exclude<ProjectAccessRole, "OWNER">;
export type ProjectSummary = {
  id: string;
  name: string;
  accessRole: ProjectAccessRole;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type ProjectDetail = ProjectSummary & {
  document: import("@examen-sw1/uml-core").ProjectDocument;
};
export type ProjectMember = {
  userId: string;
  email: string;
  role: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
};
export type ProjectInvitation = {
  id: string;
  projectId: string;
  invitedById: string;
  email: string;
  role: ProjectMemberRole;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
};
export type CreatedProjectInvitation = ProjectInvitation & { token: string };
export type PendingProjectInvitation = Omit<
  ProjectInvitation,
  "email" | "invitedById" | "resolvedAt"
> & { project: { id: string; name: string }; invitedBy: { email: string } };
export type SpringExport = { blob: Blob; filename: string };
export type MentorQueryResponse = {
  answer: string;
  grounded: boolean;
  projectRevision: number;
  diagnostic?: "INSUFFICIENT_CONTEXT" | "ELEMENT_NOT_FOUND";
};
// CU-2P-04: public contract of POST /projects/:id/mentor/analysis (backend UmlAnalysisResponse). Only the focus
// travels to the server; the model, the user and the revision are resolved there.
export type UmlAnalysisFocus =
  | { kind: "class"; id: string }
  | { kind: "relationship"; id: string }
  | { kind: "model" };
export type UmlAnalysisDiagnostic =
  | "EMPTY_MODEL"
  | "ELEMENT_NOT_FOUND"
  | "INVALID_FOCUS_ID"
  | "INCONSISTENT_REFERENCE"
  | "CONTEXT_TOO_LARGE";
export type UmlAnalysisFinding = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
  elementId?: string;
};
export type UmlAnalysisLimitation = { code: string; message: string; elementId?: string; elementIds?: string[] };
export type UmlAnalysisResult = {
  // Deterministic UML and relational facts; the UI does not render them raw.
  facts: { uml: unknown; relational: unknown };
  diagnostics: { uml: UmlAnalysisFinding[]; relational: UmlAnalysisFinding[] };
  conflicts: { code: string; message: string; table: string; column: string; relationshipIds: string[] }[];
  limitations: { unsupportedFeatures: UmlAnalysisLimitation[]; editor: UmlAnalysisLimitation[]; schema: UmlAnalysisLimitation[] };
  summary: { hasUmlErrors: boolean; hasRelationalErrors: boolean; relationalDerivable: boolean };
};
export type UmlAnalysisContextTruncation = {
  truncated: boolean;
  omitted: { classes: number; enumerations: number; relationships: number; attributes: number; diagnostics: number; limitations: number };
};
export type UmlAnalysisResponse = {
  projectRevision: number;
  focus: { kind: "class" | "relationship" | "model"; id?: string; name?: string };
  analysis: UmlAnalysisResult | null;
  explanation: { text: string; contextTruncation: UmlAnalysisContextTruncation } | null;
  diagnostic?: UmlAnalysisDiagnostic;
};
export type MentorRecommendationResponse = {
  status: "READ_ONLY";
  problem: string;
  alternatives: string[];
  rationale: string;
  limitations: string;
  confidence: number;
  needsClarification: boolean;
  requiresUmlChange: boolean;
  projectRevision: number;
};
export type VisionRecognition = {
  proposal: import("@examen-sw1/uml-core").UmlImportProposal;
  image: { width: number; height: number };
  ocrLines: number;
  elapsedMs: number;
};

export type ApiClient = {
  login(email: string, password: string): Promise<string>;
  register(email: string, password: string): Promise<void>;
  me(): Promise<AuthenticatedUser>;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(
    name: string,
    document: ProjectDetail["document"],
  ): Promise<ProjectDetail>;
  renameProject(id: string, name: string): Promise<ProjectDetail>;
  deleteProject(id: string): Promise<void>;
  getProject(id: string): Promise<ProjectDetail>;
  saveProject(
    id: string,
    document: ProjectDetail["document"],
    expectedRevision: number,
  ): Promise<ProjectDetail>;
  listMembers(id: string): Promise<ProjectMember[]>;
  updateMember(
    id: string,
    userId: string,
    role: ProjectMemberRole,
  ): Promise<ProjectMember>;
  removeMember(id: string, userId: string): Promise<void>;
  listInvitations(id: string): Promise<ProjectInvitation[]>;
  createInvitation(
    id: string,
    email: string,
    role: ProjectMemberRole,
  ): Promise<CreatedProjectInvitation>;
  revokeInvitation(id: string, invitationId: string): Promise<void>;
  getInvitation(token: string): Promise<ProjectInvitation>;
  acceptInvitation(token: string): Promise<ProjectInvitation>;
  rejectInvitation(token: string): Promise<ProjectInvitation>;
  listMyInvitations(): Promise<PendingProjectInvitation[]>;
  acceptInvitationById(id: string): Promise<ProjectInvitation>;
  rejectInvitationById(id: string): Promise<ProjectInvitation>;
  exportSpring(id: string, basePackage: string): Promise<SpringExport>;
  exportFrontend(id: string): Promise<FrontendExport>;
  queryMentor(id: string, question: string): Promise<MentorQueryResponse>;
  analyzeUml(id: string, focus: UmlAnalysisFocus): Promise<UmlAnalysisResponse>;
  recommendMentor(id: string, question: string): Promise<MentorRecommendationResponse>;
  recognizeDiagram(id: string, image: Blob): Promise<VisionRecognition>;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type ApiClientOptions = {
  getToken: () => string | null;
  onUnauthorized: () => void;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  waitForRetry?: (milliseconds: number) => Promise<void>;
};

const RECOMMENDATION_TRANSPORT_RETRY_DELAY_MS = 500;

const waitForRetry = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  path: string,
  {
    getToken,
    onUnauthorized,
    fetcher = fetch,
    apiBaseUrl = API_BASE_URL,
  }: ApiClientOptions,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetcher(`${apiBaseUrl}${path}`, { ...init, headers, cache: "no-store" });
  } catch (error) {
    if (error instanceof TypeError) throw new TransportError(error.message);
    throw error;
  }
  if (response.status === 401) {
    onUnauthorized();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(" ")
      : body?.message;
    throw new ApiError(
      response.status,
      message ?? "No fue posible completar la solicitud.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

class TransportError extends Error {}

async function requestMentorRecommendation(
  id: string,
  question: string,
  options: ApiClientOptions,
): Promise<MentorRecommendationResponse> {
  const path = `/projects/${encodeURIComponent(id)}/mentor/recommendations`;
  const init = { method: "POST", body: JSON.stringify({ question }) };
  try {
    return await request<MentorRecommendationResponse>(path, options, init);
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    await (options.waitForRetry ?? waitForRetry)(RECOMMENDATION_TRANSPORT_RETRY_DELAY_MS);
    return request<MentorRecommendationResponse>(path, options, init);
  }
}

export type FrontendExport = { blob: Blob; filename: string };
function safeZipFilename(value: string | null, fallback: string): string {
  const candidate =
    value?.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.[1] ??
    value?.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.[2];
  if (candidate && /^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(candidate))
    return candidate;
  return fallback;
}

async function requestSpringExport(
  id: string,
  basePackage: string,
  {
    getToken,
    onUnauthorized,
    fetcher = fetch,
    apiBaseUrl = API_BASE_URL,
  }: ApiClientOptions,
): Promise<SpringExport> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetcher(
    `${apiBaseUrl}/projects/${encodeURIComponent(id)}/exports/spring`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ basePackage }),
      cache: "no-store",
    },
  );
  if (response.status === 401) onUnauthorized();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(" ")
      : body?.message;
    throw new ApiError(
      response.status,
      message ?? "No fue posible generar el backend.",
    );
  }
  return {
    blob: await response.blob(),
    filename: safeZipFilename(
      response.headers.get("Content-Disposition"),
      `spring-backend-${id.replace(/[^A-Za-z0-9-]/g, "") || "project"}.zip`,
    ),
  };
}

async function requestFrontendExport(
  id: string,
  {
    getToken,
    onUnauthorized,
    fetcher = fetch,
    apiBaseUrl = API_BASE_URL,
  }: ApiClientOptions,
): Promise<FrontendExport> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetcher(
    `${apiBaseUrl}/projects/${encodeURIComponent(id)}/exports/frontend`,
    { method: "POST", headers, cache: "no-store" },
  );
  if (response.status === 401) onUnauthorized();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    throw new ApiError(
      response.status,
      Array.isArray(body?.message)
        ? body.message.join(" ")
        : (body?.message ?? "No fue posible preparar la interfaz."),
    );
  }
  return {
    blob: await response.blob(),
    filename: safeZipFilename(
      response.headers.get("Content-Disposition"),
      "frontend.zip",
    ),
  };
}

// The image goes as the raw body; errors carry a structured { diagnostic } instead of { message }.
async function requestDiagramRecognition(
  id: string,
  image: Blob,
  {
    getToken,
    onUnauthorized,
    fetcher = fetch,
    apiBaseUrl = API_BASE_URL,
  }: ApiClientOptions,
): Promise<VisionRecognition> {
  const headers = new Headers({
    "Content-Type": image.type === "image/jpeg" ? "image/jpeg" : image.type === "image/png" ? "image/png" : "application/octet-stream",
  });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetcher(
    `${apiBaseUrl}/projects/${encodeURIComponent(id)}/vision/uml-proposal`,
    { method: "POST", headers, body: image, cache: "no-store" },
  );
  if (response.status === 401) onUnauthorized();
  const body = (await response.json().catch(() => null)) as
    | (VisionRecognition & { ok: true })
    | { ok?: false; diagnostic?: { message?: string }; message?: string | string[] }
    | null;
  if (!response.ok || !body || body.ok !== true) {
    const failure = body as { diagnostic?: { message?: string }; message?: string | string[] } | null;
    const message =
      failure?.diagnostic?.message ??
      (Array.isArray(failure?.message) ? failure.message.join(" ") : failure?.message);
    throw new ApiError(
      response.status,
      message ?? "No fue posible reconocer la imagen.",
    );
  }
  return {
    proposal: body.proposal,
    image: body.image,
    ocrLines: body.ocrLines,
    elapsedMs: body.elapsedMs,
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return {
    async login(email, password) {
      const response = await request<{ accessToken: string }>(
        "/auth/login",
        options,
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      return response.accessToken;
    },
    async register(email, password) {
      await request("/auth/register", options, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
    me() {
      return request<AuthenticatedUser>("/auth/me", options);
    },
    listProjects: () => request<ProjectSummary[]>("/projects", options),
    createProject: (name, document) =>
      request<ProjectDetail>("/projects", options, {
        method: "POST",
        body: JSON.stringify({ name, document }),
      }),
    renameProject: (id, name) =>
      request<ProjectDetail>(`/projects/${id}`, options, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    deleteProject: (id) =>
      request<void>(`/projects/${id}`, options, { method: "DELETE" }),
    getProject: (id) => request<ProjectDetail>(`/projects/${id}`, options),
    saveProject: (id, document, expectedRevision) =>
      request<ProjectDetail>(`/projects/${id}`, options, {
        method: "PUT",
        body: JSON.stringify({ document, expectedRevision }),
      }),
    listMembers: (id) =>
      request<ProjectMember[]>(`/projects/${id}/members`, options),
    updateMember: (id, userId, role) =>
      request<ProjectMember>(`/projects/${id}/members/${userId}`, options, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    removeMember: (id, userId) =>
      request<void>(`/projects/${id}/members/${userId}`, options, {
        method: "DELETE",
      }),
    listInvitations: (id) =>
      request<ProjectInvitation[]>(`/projects/${id}/invitations`, options),
    createInvitation: (id, email, role) =>
      request<CreatedProjectInvitation>(
        `/projects/${id}/invitations`,
        options,
        { method: "POST", body: JSON.stringify({ email, role }) },
      ),
    revokeInvitation: (id, invitationId) =>
      request<void>(`/projects/${id}/invitations/${invitationId}`, options, {
        method: "DELETE",
      }),
    getInvitation: (token) =>
      request<ProjectInvitation>(
        `/invitations/${encodeURIComponent(token)}`,
        options,
      ),
    acceptInvitation: (token) =>
      request<ProjectInvitation>(
        `/invitations/${encodeURIComponent(token)}/accept`,
        options,
        { method: "POST" },
      ),
    rejectInvitation: (token) =>
      request<ProjectInvitation>(
        `/invitations/${encodeURIComponent(token)}/reject`,
        options,
        { method: "POST" },
      ),
    listMyInvitations: () =>
      request<PendingProjectInvitation[]>("/invitations", options),
    acceptInvitationById: (id) =>
      request<ProjectInvitation>(
        `/invitations/by-id/${encodeURIComponent(id)}/accept`,
        options,
        { method: "POST" },
      ),
    rejectInvitationById: (id) =>
      request<ProjectInvitation>(
        `/invitations/by-id/${encodeURIComponent(id)}/reject`,
        options,
        { method: "POST" },
      ),
    exportSpring: (id, basePackage) =>
      requestSpringExport(id, basePackage, options),
    exportFrontend: (id) => requestFrontendExport(id, options),
    queryMentor: (id, question) =>
      request<MentorQueryResponse>(`/projects/${encodeURIComponent(id)}/mentor/query`, options, {
        method: "POST",
        body: JSON.stringify({ question }),
      }),
    analyzeUml: (id, focus) =>
      request<UmlAnalysisResponse>(`/projects/${encodeURIComponent(id)}/mentor/analysis`, options, {
        method: "POST",
        // Rebuilt field by field so nothing else (store state, names, layout) can travel with the focus.
        body: JSON.stringify({ focus: focus.kind === "model" ? { kind: "model" } : { kind: focus.kind, id: focus.id } }),
      }),
    recommendMentor: (id, question) => requestMentorRecommendation(id, question, options),
    recognizeDiagram: (id, image) =>
      requestDiagramRecognition(id, image, options),
  };
}
