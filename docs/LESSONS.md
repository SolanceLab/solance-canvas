# Lessons

Everything here cost us something. They are written down because the code alone
doesn't explain why it is shaped the way it is, and because every one of them is
the kind of bug that looks like success until much later.

---

## 1. A provider URL is a link to someone else's disk

Most image APIs hand back a URL. It is tempting to store that string and move on —
it is small, it renders, the feature works.

It works until it doesn't. xAI's image URLs are documented as temporary. One of ours
died inside 48 hours, and the gallery row survived pointing at nothing.

**The rule:** take ownership of the bytes before you store the row. Download once,
put the bytes somewhere you control, store *your* key. `storage.js` does this.

This is not paranoia about one provider. Any URL you did not issue is a dependency
on someone else's retention policy, and none of them promise you anything.

---

## 2. Base64 in a database column has a ceiling, and you will find it in production

The obvious alternative to a remote URL is to inline the image as a `data:` URL and
store that. It is self-contained, it needs no bucket, and it works beautifully for
small renders.

A 4K render is roughly 30MB as base64. The database rejects the write outright.

**What made it a real bug rather than an error message:** the generation endpoint
deliberately returns the image anyway rather than dropping it — a degraded response
beats a lost render. But the UI never read the flag that said the save had failed.
So a 4K image would generate, display, look completely successful, be absent from
the gallery, and vanish on refresh. No error anywhere.

**The rules, both halves:**
- Degrade, never drop. Storage failure falls back to the provider's value.
- **If you degrade, the caller must be able to tell.** `persisted`, `persist_error`
  and `image_stored` are in the response for this reason, and a UI that ignores them
  is reintroducing the bug. The reference UI shows a banner on `persisted === false`.

---

## 3. A comment is not an invariant

While wiring one provider we forced `b64_json` output specifically so generated
images would never sit on the provider's public bucket. We wrote a comment saying so.

Then we kept the conventional `b64 ? ... : (url || null)` fallback underneath it —
*and wrote a test that blessed the fallback.*

The comment said one thing. The code said another. The test agreed with the code.
A cross-model security review caught it before it shipped; the public bucket URL
would have been persisted and served straight to a gallery.

**The rule:** if a comment claims a guarantee, the code must enforce it, and no test
may bless the hole. In `providers/agnes.js` a URL response is now downloaded and
re-encoded, or it fails loudly.

---

## 4. Two response shapes, both of which lose images

Providers return generated images in one of two shapes: base64 in the body, or a URL
to fetch. Lesson 1 kills the URL path if you store it raw. Lesson 2 kills the base64
path if you store it raw.

Handling only one of them is the trap, because whichever one you skip will be the
shape your next provider uses.

`createR2Storage(bucket).store()` in `worker/src/storage.js` normalises both to
bytes before anything is persisted: it pattern-matches a `data:` URL and decodes
the base64 inline, or `fetch()`s an `https:` URL and reads the body — either way
the result is raw bytes, written to R2 under one flat `<uuid>.<ext>` key. Both
`handleGenerate` and `handleGenerateResult` in `worker/src/index.js` call
`storage.store(result.image_url)` on whatever a provider handed back, so neither
of the two shapes above skips this step.

---

## 5. Slow models need a ticket, not a longer timeout

Cloudflare cuts a request at the edge. Some models finish comfortably inside that;
others (large models with reference images) do not, and no amount of client timeout
changes it.

The fal integration submits to the provider's async queue, polls inline for a short
budget, and — if it hasn't finished — returns a **pending ticket** the client polls
via a second endpoint. Fast models finish in one shot and never see the ticket path.

**The rule:** when a provider is slow, change the shape of the request, not the
timeout. A pending ticket is a normal 200 with more work to do; a timeout is a lost
render and an angry user.

Measured, because we guessed wrong once: a 4K render took 154s wall / 131s provider
and **did not** hit an edge cutoff. The wall was never the timeout — the wall was
row size (lesson 2). Measure before you design around a limit you assumed.

---

## 6. Renaming a key can delete a user's work while looking successful

Renaming this feature meant renaming its localStorage key, where users' saved style
presets live. A blind rename would have silently orphaned every preset anyone had
made — the app would load, look fine, and the work would be gone.

`readStoredStyles()` migrates from the legacy key and keeps it readable for rollback.
It was verified by seeding the old key and reloading, not by reasoning about it.

**The rule:** a storage key is a schema. Migrate it, keep the old one readable, and
prove the migration by actually running it against real old data.

---

*These are the ones that drew blood. If you extend this and find another, add it here —
that is what the file is for.*
