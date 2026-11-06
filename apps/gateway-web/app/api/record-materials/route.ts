import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { currentUser, requireSessionBearer } from "../../../lib/session";
import { hasTrustedOrigin } from "../../../lib/request-origin";
import { safeReturnTo } from "../../../lib/return-to";
import {
  createLinkedDocument,
  detachDocument,
  reviseMaterial,
  type MaterialTarget,
} from "../../../lib/document-api";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const form = await request.formData(),
    value = (name: string) => String(form.get(name) ?? "");
  const targetType = value("targetType") as MaterialTarget;
  if (
    !["amendment_material", "change_material", "lifecycle_material"].includes(
      targetType,
    )
  )
    return new Response("Invalid target", { status: 400 });
  const user = await currentUser(),
    role = targetType === "lifecycle_material" ? "publisher" : "editor";
  if (!user?.roles.some((r) => r === role || r === "admin"))
    return new Response("Forbidden", { status: 403 });
  const targetId = value("targetId"),
    scopeRevisionId = value("scope") || null;
  const returnTo = safeReturnTo(value("returnTo"), "/");
  const destination = new URL(returnTo, request.url);
  try {
    const authorization = await requireSessionBearer();
    if (value("action") === "remove")
      await detachDocument(
        targetType,
        targetId,
        value("documentId"),
        authorization,
        scopeRevisionId,
      );
    else if (value("action") === "edit")
      await reviseMaterial(
        targetType,
        targetId,
        value("documentId"),
        {
          title: value("title"),
          description: value("description"),
          sourceUrl: value("sourceUrl"),
          expectedRevision: Number(value("expectedRevision")),
          expectedLinkedRevisionId: value("expectedLinkedRevisionId"),
          scopeRevisionId,
        },
        authorization,
      );
    else {
      const uploaded = form.get("file"),
        file = uploaded instanceof File && uploaded.size ? uploaded : null;
      if (file && file.size > 20 * 1024 * 1024)
        throw new Error("File too large");
      await createLinkedDocument(
        targetType,
        targetId,
        {
          operationId: value("operationId"),
          title: value("title"),
          description: value("description"),
          sourceUrl: value("sourceUrl"),
          scopeRevisionId,
        },
        file,
        authorization,
      );
    }
    revalidatePath(destination.pathname);
    destination.searchParams.delete("materialsError");
    destination.searchParams.set("materialsSaved", "1");
  } catch {
    destination.searchParams.set("materialsError", "1");
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.pathname + destination.search + destination.hash,
    },
  });
}
