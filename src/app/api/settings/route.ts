import crypto from "crypto";
import { logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { getAppBrand, setAppSetting } from "@/lib/queries";
import { saveUpload, deleteUpload } from "@/lib/storage";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"]);
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

/**
 * POST multipart { name?, logo?, remove_logo? } → update the household brand.
 * Owner only (same tier as user management).
 */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_users");
    const form = await req.formData();
    const name = form.get("name");
    const logo = form.get("logo");
    const removeLogo = form.get("remove_logo") === "1";

    if (typeof name === "string") {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return Response.json({ error: "Name can't be empty" }, { status: 400 });
      await setAppSetting("app_name", trimmed);
    }

    const current = await getAppBrand();
    if (removeLogo && current.logo) {
      await setAppSetting("app_logo", null);
      await deleteUpload(current.logo);
    } else if (logo instanceof File && logo.size > 0) {
      if (!LOGO_TYPES.has(logo.type)) {
        return Response.json({ error: "Logo must be PNG, JPG, WebP, SVG or GIF" }, { status: 415 });
      }
      if (logo.size > MAX_LOGO_BYTES) {
        return Response.json({ error: "Logo too large (4 MB max)" }, { status: 413 });
      }
      const ext = logo.name.split(".").pop()?.toLowerCase() ?? "png";
      const stored = await saveUpload(
        Buffer.from(await logo.arrayBuffer()),
        `brand/${crypto.randomBytes(6).toString("hex")}-logo.${ext}`,
        logo.type
      );
      await setAppSetting("app_logo", stored);
      await deleteUpload(current.logo);
    }

    await logActivity("settings", "Household brand updated");
    return Response.json(await getAppBrand());
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}
