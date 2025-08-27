import { type Middleware } from "../router";

const ALLOW_ORIGINS = ["https://blog.day1swhan.com", "http://localhost:3000"];
const ALLOW_METHODS = ["GET, POST, OPTIONS"];
const ALLOW_HEADERS = ["Content-Type"];
const ALLOW_CREDENTIALS = true;
const MAX_AGE = 300;
const VARY = ["Origin"];

export const verifyOriginMiddleware: Middleware<Env> = (next) => async (req, context) => {
  let origin = req.headers.get("origin") || "";

  if (origin && origin.endsWith("/")) origin = origin.slice(0, -1);
  if (!ALLOW_ORIGINS.includes(origin)) {
    return Response.json({ message: "Not Allowed Origin" }, { status: 403 });
  }

  return next(req, context);
};

export const corsMiddleware: Middleware<Env> = (next) => async (req, context) => {
  const response = await next(req, context);

  const params = {
    "Access-Control-Allow-Origin": ALLOW_ORIGINS.join(", "),
    "Access-Control-Allow-Methods": ALLOW_METHODS.join(", "),
    "Access-Control-Allow-Headers": ALLOW_HEADERS.join(", "),
    "Access-Control-Allow-Credentials": String(ALLOW_CREDENTIALS),
    "Access-Control-Max-Age": String(MAX_AGE),
    Vary: VARY.join(", "),
  };

  for (const [k, v] of Object.entries(params)) {
    response.headers.set(k, v);
  }

  return response;
};
