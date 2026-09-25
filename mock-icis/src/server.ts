import { buildMockIcis } from "./app.js"

const { app } = buildMockIcis()
const port = Number(process.env.PORT ?? 3200)

app
  .listen({ port, host: "127.0.0.1" })
  .then(() => console.log(`Mock ICIS on http://localhost:${port} (demo data only)`))
  .catch((err: unknown) => {
    console.error("failed to start mock ICIS", err)
    process.exit(1)
  })
