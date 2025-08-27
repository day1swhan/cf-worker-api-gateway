import { type Middleware } from "../router";

const ALLOW_ORIGINS = ["http://localhost:3000", "https://blog.day1swhan.com"];
const ALLOW_METHODS = ["GET, POST, OPTIONS"];
const ALLOW_HEADERS = ["Content-Type"];
const ALLOW_CREDENTIALS = true;
const MAX_AGE = 300;
const VARY = ["Origin"];

export const verifyOriginMiddleware: Middleware<Env> = (next) => async (req, context) => {
  let origin = req.headers.get("origin") || "";
  if (origin.length > 1 && origin.endsWith("/")) origin = origin.slice(0, -1);

  if (!ALLOW_ORIGINS.includes(origin)) {
    return Response.json({ message: "Not Allowed Origin" }, { status: 403 });
  }

  return next(req, context);
};

export const corsMiddleware: Middleware<Env> = (next) => async (req, context) => {
  let origin = req.headers.get("origin") || ALLOW_ORIGINS[0];
  if (origin.length > 1 && origin.endsWith("/")) origin = origin.slice(0, -1);

  const params = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOW_METHODS.join(", "),
    "Access-Control-Allow-Headers": ALLOW_HEADERS.join(", "),
    "Access-Control-Allow-Credentials": String(ALLOW_CREDENTIALS),
    "Access-Control-Max-Age": String(MAX_AGE),
    Vary: VARY.join(", "),
  };

  const response = await next(req, context);

  for (const [k, v] of Object.entries(params)) {
    response.headers.set(k, v);
  }

  return response;
};
