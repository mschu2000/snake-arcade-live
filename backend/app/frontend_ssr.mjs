import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const distDir = process.env.FRONTEND_DIST_DIR;
const port = Number(process.env.FRONTEND_SSR_PORT ?? "3001");

if (!distDir) {
  throw new Error("FRONTEND_DIST_DIR is required");
}

const clientDir = path.join(distDir, "client");
const serverEntry = path.join(distDir, "server", "server.js");
const { default: handler } = await import(pathToFileURL(serverEntry).href);

function contentTypeFor(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".map")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveFile(res, filePath) {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return false;
    res.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "content-length": file.size,
      "cache-control": "public, max-age=31536000, immutable",
    });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

  if (requestUrl.pathname === "/__health") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  const relativePath = requestUrl.pathname.replace(/^\/+/, "");
  if (relativePath) {
    const candidate = path.join(clientDir, relativePath);
    if (await serveFile(res, candidate)) {
      return;
    }
    if (relativePath.startsWith("assets/") || path.extname(relativePath)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
  }

  const request = new Request(requestUrl, {
    method: req.method,
    headers: req.headers,
  });
  const response = await handler.fetch(request, {}, {});
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  if (!response.body) {
    res.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Frontend SSR server listening on http://127.0.0.1:${port}`);
});
