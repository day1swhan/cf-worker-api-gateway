import { WorkerAPIGateway } from "./router";
import { corsMiddleware } from "./middleware";

const app = new WorkerAPIGateway<Env>({ ignoreTrailingSlash: true });

app.use("/user", corsMiddleware);

app.get("/", (req, context) => {
  return Response.json({ message: "Hello World!" });
});

app.get("/user/:id", (req, context) => {
  const { params, query, cookie } = context;
  return Response.json({ params, query, cookie });
});

app.post("/user/:id", (req, context) => {
  return Response.json("Success!");
});

app.onError((req, context, err) => {
  console.log("Error: " + (err as Error)?.message || "unknown");
  return Response.json({ message: "Bad Request" }, { status: 400 });
});

export default app.export() satisfies ExportedHandler<Env>;
