import { WorkerAPIGateway } from "./router";

const app = new WorkerAPIGateway<Env>({ ignoreTrailingSlash: true });

app.get("/", (req, context) => {
  return Response.json({ message: "hello world" });
});

app.get("/user/:id", (req, context) => {
  const { params, query, cookie } = context;
  return Response.json({ params, query, cookie });
});

app.onError((req, context, err) => {
  console.log("Error: " + (err as Error)?.message || "unknown");
  return Response.json({ message: "Bad Request" }, { status: 400 });
});

export default app.export() satisfies ExportedHandler<Env>;
