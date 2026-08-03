import { run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  active: z.string().min(1).max(60),
  customs: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        ground: z.enum(["dark", "light"]),
        colors: z.tuple([z.string(), z.string(), z.string()]),
      })
    )
    .max(20),
});

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Invalid theme prefs" }, { status: 400 });
  await run("UPDATE users SET theme_prefs = $1 WHERE id = $2", [
    JSON.stringify(parsed.data),
    user.id,
  ]);
  return Response.json({ ok: true });
}
