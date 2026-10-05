import { defineMiddleware } from "astro:middleware";
import { COOKIE_NAME, missingAdminEnv, verifySession } from "./lib/admin/logic";

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  if (!isAdmin || path === "/admin/login") return next();

  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const token = context.cookies.get(COOKIE_NAME)?.value;
  if (missingAdminEnv(process.env).length || !token || !verifySession(token, secret)) {
    return context.redirect("/admin/login");
  }
  return next();
});
