import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { currentUser } from "../../../lib/session";
import {
  createLinkedDocument,
  detachDocument,
  reviseMaterial,
} from "../../../lib/document-api";
vi.mock("../../../lib/session", () => ({
  currentUser: vi.fn(),
  requireSessionBearer: async () => "Bearer session",
}));
vi.mock("../../../lib/document-api", () => ({
  createLinkedDocument: vi.fn(),
  detachDocument: vi.fn(),
  reviseMaterial: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
function request(type = "change_material", origin = "https://atlas.example") {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    targetType: type,
    targetId: "amendment",
    scope: "exact-change",
    operationId: "attempt",
    title: "Context",
    description: "An exact scoped note.",
    returnTo:
      "/countries/DE/constitutions/charter/amendments/law#change-exact-change",
  }))
    form.set(key, value);
  return new NextRequest("http://localhost:3000/api/record-materials", {
    method: "POST",
    headers: { host: "atlas.example", "x-forwarded-proto": "https", origin },
    body: form,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(currentUser).mockResolvedValue({
    id: "editor",
    email: "editor@example.test",
    roles: ["editor"],
  });
});
it("preserves exact material scope and returns a relative location behind a reverse proxy", async () => {
  const response = await POST(request());
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "/countries/DE/constitutions/charter/amendments/law?materialsSaved=1#change-exact-change",
  );
  expect(createLinkedDocument).toHaveBeenCalledWith(
    "change_material",
    "amendment",
    expect.objectContaining({
      scopeRevisionId: "exact-change",
      description: "An exact scoped note.",
      operationId: "attempt",
    }),
    null,
    "Bearer session",
  );
});
it("rejects cross-origin writes before calling the document API", async () => {
  expect(
    (await POST(request("change_material", "https://attacker.example"))).status,
  ).toBe(403);
  expect(createLinkedDocument).not.toHaveBeenCalled();
});
it.each([
  ["viewer", "amendment_material"],
  ["reviewer", "change_material"],
  ["publisher", "change_material"],
  ["editor", "lifecycle_material"],
])("rejects %s writing %s", async (role, type) => {
  vi.mocked(currentUser).mockResolvedValue({
    id: role,
    email: role + "@example.test",
    roles: [role],
  });
  expect((await POST(request(type))).status).toBe(403);
  expect(createLinkedDocument).not.toHaveBeenCalled();
  expect(detachDocument).not.toHaveBeenCalled();
  expect(reviseMaterial).not.toHaveBeenCalled();
});
it("allows a publisher to add event materials", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    id: "publisher",
    email: "publisher@example.test",
    roles: ["publisher"],
  });
  expect((await POST(request("lifecycle_material"))).status).toBe(303);
  expect(createLinkedDocument).toHaveBeenCalled();
});
