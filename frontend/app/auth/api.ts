export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export type ProjectAccessRole = "OWNER" | "EDITOR" | "VIEWER";
export type ProjectMemberRole = Exclude<ProjectAccessRole, "OWNER">;
export type ProjectSummary = { id: string; name: string; accessRole: ProjectAccessRole; revision: number; createdAt: string; updatedAt: string };
export type ProjectDetail = ProjectSummary & { document: import("@examen-sw1/uml-core").ProjectDocument };
export type ProjectMember = { userId: string; email: string; role: ProjectMemberRole; createdAt: string; updatedAt: string };
export type ProjectInvitation = { id: string; projectId: string; invitedById: string; email: string; role: ProjectMemberRole; status: "PENDING" | "ACCEPTED" | "REJECTED" | "REVOKED"; expiresAt: string; createdAt: string; resolvedAt: string | null };
export type CreatedProjectInvitation = ProjectInvitation & { token: string };
export type PendingProjectInvitation = Omit<ProjectInvitation, "email" | "invitedById" | "resolvedAt"> & { project: { id: string; name: string }; invitedBy: { email: string } };
export type SpringExport = { blob: Blob; filename: string };

export type ApiClient = {
  login(email: string, password: string): Promise<string>;
  register(email: string, password: string): Promise<void>;
  me(): Promise<AuthenticatedUser>;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string, document: ProjectDetail["document"]): Promise<ProjectDetail>;
  renameProject(id: string, name: string): Promise<ProjectDetail>;
  deleteProject(id: string): Promise<void>;
  getProject(id: string): Promise<ProjectDetail>;
  saveProject(id: string, document: ProjectDetail["document"], expectedRevision: number): Promise<ProjectDetail>;
  listMembers(id: string): Promise<ProjectMember[]>;
  updateMember(id: string, userId: string, role: ProjectMemberRole): Promise<ProjectMember>;
  removeMember(id: string, userId: string): Promise<void>;
  listInvitations(id: string): Promise<ProjectInvitation[]>;
  createInvitation(id: string, email: string, role: ProjectMemberRole): Promise<CreatedProjectInvitation>;
  revokeInvitation(id: string, invitationId: string): Promise<void>;
  getInvitation(token: string): Promise<ProjectInvitation>;
  acceptInvitation(token: string): Promise<ProjectInvitation>;
  rejectInvitation(token: string): Promise<ProjectInvitation>;
  listMyInvitations(): Promise<PendingProjectInvitation[]>;
  acceptInvitationById(id: string): Promise<ProjectInvitation>;
  rejectInvitationById(id: string): Promise<ProjectInvitation>;
  exportSpring(id: string, basePackage: string): Promise<SpringExport>;
};

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type ApiClientOptions = {
  getToken: () => string | null;
  onUnauthorized: () => void;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
};

async function request<T>(
  path: string,
  { getToken, onUnauthorized, fetcher = fetch, apiBaseUrl = API_BASE_URL }: ApiClientOptions,
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

  const response = await fetcher(`${apiBaseUrl}${path}`, { ...init, headers, cache: "no-store" });
  if (response.status === 401) {
    onUnauthorized();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
    throw new ApiError(response.status, message ?? "No fue posible completar la solicitud.");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function safeZipFilename(value: string | null, projectId: string): string {
  const candidate = value?.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.[1] ?? value?.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.[2];
  if (candidate && /^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(candidate)) return candidate;
  return `spring-backend-${projectId.replace(/[^A-Za-z0-9-]/g, "") || "project"}.zip`;
}

async function requestSpringExport(id: string, basePackage: string, { getToken, onUnauthorized, fetcher = fetch, apiBaseUrl = API_BASE_URL }: ApiClientOptions): Promise<SpringExport> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetcher(`${apiBaseUrl}/projects/${encodeURIComponent(id)}/exports/spring`, {
    method: "POST",
    headers,
    body: JSON.stringify({ basePackage }),
    cache: "no-store",
  });
  if (response.status === 401) onUnauthorized();
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
    throw new ApiError(response.status, message ?? "No fue posible generar el backend.");
  }
  return {
    blob: await response.blob(),
    filename: safeZipFilename(response.headers.get("Content-Disposition"), id),
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return {
    async login(email, password) {
      const response = await request<{ accessToken: string }>("/auth/login", options, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      return response.accessToken;
    },
    async register(email, password) {
      await request("/auth/register", options, { method: "POST", body: JSON.stringify({ email, password }) });
    },
    me() {
      return request<AuthenticatedUser>("/auth/me", options);
    },
    listProjects: () => request<ProjectSummary[]>("/projects", options),
    createProject: (name, document) => request<ProjectDetail>("/projects", options, { method: "POST", body: JSON.stringify({ name, document }) }),
    renameProject: (id, name) => request<ProjectDetail>(`/projects/${id}`, options, { method: "PATCH", body: JSON.stringify({ name }) }),
    deleteProject: (id) => request<void>(`/projects/${id}`, options, { method: "DELETE" }),
    getProject: (id) => request<ProjectDetail>(`/projects/${id}`, options),
    saveProject: (id, document, expectedRevision) => request<ProjectDetail>(`/projects/${id}`, options, { method: "PUT", body: JSON.stringify({ document, expectedRevision }) }),
    listMembers: (id) => request<ProjectMember[]>(`/projects/${id}/members`, options),
    updateMember: (id, userId, role) => request<ProjectMember>(`/projects/${id}/members/${userId}`, options, { method: "PATCH", body: JSON.stringify({ role }) }),
    removeMember: (id, userId) => request<void>(`/projects/${id}/members/${userId}`, options, { method: "DELETE" }),
    listInvitations: (id) => request<ProjectInvitation[]>(`/projects/${id}/invitations`, options),
    createInvitation: (id, email, role) => request<CreatedProjectInvitation>(`/projects/${id}/invitations`, options, { method: "POST", body: JSON.stringify({ email, role }) }),
    revokeInvitation: (id, invitationId) => request<void>(`/projects/${id}/invitations/${invitationId}`, options, { method: "DELETE" }),
    getInvitation: (token) => request<ProjectInvitation>(`/invitations/${encodeURIComponent(token)}`, options),
    acceptInvitation: (token) => request<ProjectInvitation>(`/invitations/${encodeURIComponent(token)}/accept`, options, { method: "POST" }),
    rejectInvitation: (token) => request<ProjectInvitation>(`/invitations/${encodeURIComponent(token)}/reject`, options, { method: "POST" }),
    listMyInvitations: () => request<PendingProjectInvitation[]>("/invitations", options),
    acceptInvitationById: (id) => request<ProjectInvitation>(`/invitations/by-id/${encodeURIComponent(id)}/accept`, options, { method: "POST" }),
    rejectInvitationById: (id) => request<ProjectInvitation>(`/invitations/by-id/${encodeURIComponent(id)}/reject`, options, { method: "POST" }),
    exportSpring: (id, basePackage) => requestSpringExport(id, basePackage, options),
  };
}
