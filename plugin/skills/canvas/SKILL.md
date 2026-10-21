---
name: canvas
description: Generate or edit images through your own Canvas server, with seven image providers behind one interface.
---

# Canvas

Canvas generates images through the Worker you deployed. It has no MCP tools of its own yet; the Worker answers four HTTP routes.

- `POST /generate`: make an image from a prompt. Pass `provider` and `model`; optional `references` (images to edit or guide from), `aspect`, `resolution`. Slow providers (fal) return a pending ticket.
- `POST /generate/result`: poll a pending ticket.
- `GET /image/:key`: fetch an image the Worker stored.

Limits: with `AUTH_TOKEN` set, both POST routes need `Authorization: Bearer <token>`. Read `persisted`, `image_stored` and `persist_error` in every response: without an R2 bucket nothing is stored and the caller must keep the image. OpenAI takes at most 16 reference images, Venice one, Stability none; the UI attaches up to 3. OpenAI references must be base64 or data URLs, not remote URLs.
