---
name: solance-canvas
description: Use when the user wants to generate or edit an image through their own Canvas Worker (Gemini, Grok, fal, OpenAI, Stability, Agnes or Venice behind one interface), or asks how to set it up or call it. Calls the Worker's HTTP routes with curl and reports whether the image was stored.
---

# Canvas

Canvas is an image-generation Worker the user puts in their own Cloudflare account. This plugin does not set it up and holds no server: it teaches you to call the user's Worker. Nothing is sent anywhere else.

## Before the first image

1. Ask where their Worker answers (an address like `https://canvas.example.workers.dev`). Use it as `$CANVAS_URL`. If they have no Worker yet, the setup steps are in the repository README (https://github.com/SolanceLab/solance-canvas): copy `worker/wrangler.toml.example`, set one provider key as a Worker secret, then publish the Worker with wrangler. Help with that only when they ask.
2. Ask whether the Worker has an `AUTH_TOKEN` set. If it does, the token must already be in the environment as `CANVAS_AUTH_TOKEN`. Never ask for the token in the chat, never type it into a command, never print it. Use it through the variable.

## Generate

```
curl -sS -X POST "$CANVAS_URL/generate" \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $CANVAS_AUTH_TOKEN" \
  -d '{"prompt":"a brass key on dark walnut, low candlelight","provider":"gemini","model":"gemini-3.1-flash-image-preview"}'
```

- `prompt`, `provider` and `model` are all required. `model` must be a real model id for that provider. A wrong `provider` answers 400 with the list of providers the Worker has.
- Optional: `references` (up to 3 images, URLs or data URLs; OpenAI needs base64 or data URLs, Venice takes one, Stability none), `aspect`, `resolution`, `style_prompt`.
- Leave out the `Authorization` header when the Worker has no `AUTH_TOKEN`.
- The Worker uses its own provider key. To use the user's own key for one request, pass it in an `X-Provider-Key` header from an environment variable; it is used once and never stored.

## Read the whole answer, not just `image_url`

| field | meaning |
|---|---|
| `persisted` | `true`: the Worker stored the image bytes. `false`: no storage bucket, or the save failed. Keep the image yourself now |
| `image_stored` | `true`: `image_url` is a key; fetch it from `GET $CANVAS_URL/image/<key>`. `false`: `image_url` is the provider's own address or a `data:` value, and some providers' addresses expire |
| `persist_error` | why the save failed |

Save the image to a file straight away and tell the user the path. Do not just hand back a link that may expire.

## Slow providers

`fal` can answer `{"pending": true, ...}` with `status_url` and `response_url`. Send those back to `POST $CANVAS_URL/generate/result` with `provider`, `model` and `prompt` until the answer has an `image_url`.

## Limits

Prompts pass through to the provider unchanged; the provider's own policy applies. A `401` means the token is missing or wrong, a `403` means the Worker restricts which origins may call it.
