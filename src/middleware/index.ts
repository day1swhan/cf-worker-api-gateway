import { type Middleware } from "../router";

const ALLOW_ORIGINS = ["https://blog.day1swhan.com", "http://localhost:3000"];
const ALLOW_METHODS = ["GET", "POST", "OPTIONS"] as const;
const ALLOW_HEADERS = ["content-type"] as const;
const ALLOW_CREDENTIALS = true;
const MAX_AGE = 300;
const VARY = ["Origin", "Accept-Encoding"];

const getOrigin = (req: Request): string | null => {
  const origin = req.headers.get("origin");
  if (origin) return origin;

  const referer = req.headers.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

const isAllowedOrigin = (origin: string | null): string | null => {
  return origin && ALLOW_ORIGINS.includes(origin) ? origin : null;
};

export const corsMiddleware: Middleware<Env> = (next) => async (req, context) => {
  const origin = getOrigin(req);
  const allowOrigin = isAllowedOrigin(origin);

  if (req.method.toUpperCase() === "OPTIONS") {
    if (!allowOrigin) {
      return Response.json({ message: "Origin Not Allowed" }, { status: 403 });
    }

    const res = new Response(null, { status: 204 });
    res.headers.set("Access-Control-Allow-Origin", allowOrigin);
    res.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS.join(", "));
    res.headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS.join(", "));
    res.headers.set("Access-Control-Allow-Credentials", String(ALLOW_CREDENTIALS));
    res.headers.set("Access-Control-Max-Age", String(MAX_AGE));
    res.headers.set("Vary", VARY.join(", "));
    return res;
  }

  const response = await next(req, context);
  if (allowOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowOrigin);
    response.headers.set("Access-Control-Allow-Credentials", String(ALLOW_CREDENTIALS));
    response.headers.set("Vary", VARY.join(", "));
  }

  return response;
};
