export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
export type Params = Record<string, string>;
export type QueryString = Record<string, string>;
export type Cookie = Record<string, string>;
export type Token = { type: "static"; value: string } | { type: "param"; name: string };

export type CFContext<Env = unknown> = { env: Env; ctx: ExecutionContext };
export type WorkerAPIGatewayContext = { params: Params; query: QueryString; cookie: Cookie };
export type Context<Env = unknown> = CFContext<Env> & WorkerAPIGatewayContext;
export type Middleware<Env = unknown> = (next: Handler<Env>) => Handler<Env>;
export type Handler<Env = unknown> = (req: Request, context: Context<Env>) => Response | Promise<Response>;
export type ErrorHandler<Env = unknown> = (
  req: Request,
  context: Context<Env>,
  error: any
) => Response | Promise<Response>;

export type Router<Env> = {
  method: Method;
  pathname: string;
  tokens: Token[];
  middlewares: Middleware<Env>[]; //라우터 전용 미들웨어
  handler: Handler<Env>;
};

export type MiddlewareWithPrefix<Env> = { prefix: string; middlewares: Middleware<Env>[] };

export class WorkerAPIGateway<Env> {
  private routes: Router<Env>[] = [];
  private middlewareStack: MiddlewareWithPrefix<Env>[] = [];
  private ignoreTrailingSlash = true;
  private onErrorHandler: ErrorHandler<Env> | null = null;

  constructor(opts?: { ignoreTrailingSlash?: boolean }) {
    if (opts && "ignoreTrailingSlash" in opts) this.ignoreTrailingSlash = !!opts.ignoreTrailingSlash;

    const list = [requestIdMiddleware<Env>()];
    this.middlewareStack.push({ prefix: "/", middlewares: list });
  }

  use(prefixOrMw: string | Middleware<Env>, ...middlewares: Middleware<Env>[]) {
    if (typeof prefixOrMw === "string") {
      const prefix = normalizePrefix(prefixOrMw, this.ignoreTrailingSlash);
      if (!middlewares.length) {
        throw new Error("use(prefix, ...middlewares): at least one middleware required");
      }
      this.middlewareStack.push({ prefix, middlewares });
    } else {
      const list = [prefixOrMw, ...middlewares];
      this.middlewareStack.push({ prefix: "/", middlewares: list });
    }
    return this;
  }

  onError(errHandler: ErrorHandler<Env>) {
    this.onErrorHandler = errHandler;
    return this;
  }

  get(path: string, handler: Handler<Env>, ...middlewares: Middleware<Env>[]) {
    return this.add("GET", path, handler, middlewares);
  }
  post(path: string, handler: Handler<Env>, ...middlewares: Middleware<Env>[]) {
    return this.add("POST", path, handler, middlewares);
  }
  put(path: string, handler: Handler<Env>, ...middlewares: Middleware<Env>[]) {
    return this.add("PUT", path, handler, middlewares);
  }
  patch(path: string, handler: Handler<Env>, ...middlewares: Middleware<Env>[]) {
    return this.add("PATCH", path, handler, middlewares);
  }
  delete(path: string, handler: Handler<Env>, ...middlewares: Middleware<Env>[]) {
    return this.add("DELETE", path, handler, middlewares);
  }
  options(path: string, handler: Handler<Env>, ...middlewares: Middleware<Env>[]) {
    return this.add("OPTIONS", path, handler, middlewares);
  }

  export(): ExportedHandler<Env> {
    return {
      fetch: (req, env, ctx) => this.handler(req, env, ctx),
    } satisfies ExportedHandler<Env>;
  }

  private add(method: Method, path: string, handler: Handler<Env>, middlewares: Middleware<Env>[]) {
    const pathname = normalizePath(path, this.ignoreTrailingSlash);
    const tokens = tokenize(pathname);
    this.routes.push({ method, pathname, tokens, handler, middlewares });
    return this;
  }

  private async handler(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const method = req.method.toUpperCase() as Method;
    const { pathname: path, search: rawQueryString } = new URL(req.url);

    const pathname = normalizePath(path, this.ignoreTrailingSlash);
    const parts = split(pathname);
    const query = parseQueryString(rawQueryString);
    const cookie = parseCookie(req.headers.get("cookie") || "");

    let methodMismatchAllow: Set<Method> | null = null;

    for (const route of this.routes) {
      const params = matchTokens(route.tokens, parts);
      if (!params) continue;

      if (route.method !== method) {
        methodMismatchAllow ??= new Set();
        methodMismatchAllow.add(route.method);
        continue;
      }

      // 전역 미들웨어부터 실행
      const globalChain = this.middlewareStack
        .filter((mw) => pathnameStartsWith(pathname, mw.prefix))
        .sort((a, b) => a.prefix.length - b.prefix.length)
        .flatMap((mw) => mw.middlewares);

      const middlewareStack: Middleware<Env>[] = [...globalChain, ...route.middlewares];

      const context: Context<Env> = { env, ctx, params, query, cookie };
      const finalHandler: Handler<Env> = async (req, context) => route.handler(req, context);
      const handler = composeMiddleware<Env>(middlewareStack, finalHandler);

      try {
        return await handler(req, context);
      } catch (err) {
        if (this.onErrorHandler) {
          return await this.onErrorHandler(req, context, err);
        }
        console.log(err);
        return Response.json({ message: "Internal Server Error" }, { status: 500 });
      }
    }

    const middlewareStack: Middleware<Env>[] = this.middlewareStack
      .filter((mw) => pathnameStartsWith(pathname, mw.prefix))
      .sort((a, b) => a.prefix.length - b.prefix.length)
      .flatMap((mw) => mw.middlewares);

    let finalHandler: Handler<Env> = async (req, context) => {
      const body = { message: "Not Found" };
      return Response.json(body, { status: 404 });
    };

    if (methodMismatchAllow) {
      finalHandler = async (req, context) => {
        const body = { message: "Method Not Allowed" };
        const headers = { Allow: [...methodMismatchAllow].join(", ") };
        return Response.json(body, { status: 405, headers });
      };
    }

    const context: Context<Env> = { env, ctx, params: {}, query, cookie };
    const handler = composeMiddleware<Env>(middlewareStack, finalHandler);
    return handler(req, context);
  }
}

const composeMiddleware = <Env>(middlewares: Middleware<Env>[], finalHandler: Handler<Env>): Handler<Env> => {
  const handler = middlewares.reduceRight((next, middleware) => {
    return middleware(next);
  }, finalHandler);
  return handler;
};

const requestIdMiddleware =
  <Env>(): Middleware<Env> =>
  (next) =>
  async (req, context) => {
    const start = Date.now();

    const requestId = "x-request-id";
    const uuid = crypto.randomUUID();

    const headers = new Headers(req.headers);
    headers.set(requestId, uuid);

    const request = new Request(req, { headers });
    const response = await next(request, context);

    response.headers.set(requestId, uuid);
    response.headers.set("x-powered-by", "day1swhan");
    response.headers.set("x-duration-ms", (Date.now() - start).toString());
    return response;
  };

const tokenize = (path: string): Token[] => {
  const out: Token[] = [];
  const parts = split(path);
  for (const part of parts) {
    if (part.startsWith(":")) {
      const name = part.slice(1);

      if (!name) {
        throw new Error(`Invalid param in path "${path}"`);
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Bad param name "${name}" in path "${path}"`);
      }
      out.push({ type: "param", name });
    } else {
      out.push({ type: "static", value: part });
    }
  }
  return out;
};

const split = (pathname: string): string[] => {
  return pathname
    .split("/")
    .map((d) => d.trim())
    .filter((d) => !!d);
};

const normalizePrefix = (p: string, ignoreTrailing: boolean): string => {
  if (!p.startsWith("/")) p = "/" + p;
  return normalizePath(p, ignoreTrailing);
};

const normalizePath = (p: string, ignoreTrailing: boolean): string => {
  if (!p) return "/";
  if (!p.startsWith("/")) p = "/" + p;
  if (ignoreTrailing && p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
};

const pathnameStartsWith = (pathname: string, prefix: string) => {
  if (prefix === "/") return true;
  if (!pathname.startsWith(prefix)) return false;
  // /api, /api/xxxx 구분: 경계가 세그먼트 기준이어야됨
  return pathname.length === prefix.length || pathname[prefix.length] === "/";
};

const matchTokens = (tokens: Token[], parts: string[]): Params | null => {
  if (tokens.length !== parts.length) return null;

  const params: Params = {};
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const seg = parts[i];

    if (tk.type === "static") {
      if (tk.value !== seg) return null;
    } else {
      params[tk.name] = decode(seg);
    }
  }
  return params;
};

const parseQueryString = (rawQueryString: string): QueryString => {
  const init: QueryString = {};
  if (!rawQueryString) return init;

  const query = rawQueryString
    .replace(/^\?/, "")
    .split("&")
    .sort()
    .reduce((acc, part) => {
      const [k, v = null] = part.split("=");
      const key = decode(k);
      const value = v ? decode(v) : v;

      if (!value) return acc;
      acc[key] = value;

      return acc;
    }, init);

  return query;
};

const parseCookie = (rawCookie: string): Cookie => {
  const init: Cookie = {};
  if (!rawCookie) return init;

  const cookie = rawCookie
    .replace(/;/g, "")
    .split(" ")
    .sort()
    .reduce((acc, part) => {
      const [k, v = null] = part.split("=");
      const key = decode(k);
      const value = v ? decode(v) : v;

      if (!value) return acc;
      acc[key] = value;

      return acc;
    }, init);
  return cookie;
};

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
