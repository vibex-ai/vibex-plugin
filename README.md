# vibex-plugin

The official catalog for Vibex desktop plugins.

This repository is a **static site**. The desktop reads one signed index and a
list of immutable packages; nothing here runs a server, and nothing here
executes plugin code. A submission is reviewed like a pull request because
that is exactly what it is.

```
plugins/<publisher>/<id>/plugin.json   one reviewed catalog entry
examples/<id>/                         the source of a first-party plugin
packages/<id>-<version>.vplug          the built package an entry points at
publisher-keys.json                    publisher public keys the index vouches for
revocations.json                       blocked plugins and versions
dist/index.json                        built and signed by CI
dist/index.json.sig
dist/revocations.json
dist/revocations.json.sig
```

`dist/` is generated. Edit `plugins/`, `examples/`, `packages/`,
`publisher-keys.json` and `revocations.json`; never edit `dist/` by hand.

`examples/` holds the readable source of the first-party plugins so the catalog
is reproducible: `vibex-plugin pack examples/<id>` rebuilds the `.vplug` in
`packages/`, and its hash is what the entry publishes. A third-party plugin
keeps its source in its own repository and only its built package lands here.

## Index addresses

The desktop tries these in order, and every one serves the same signature:

- `https://raw.githubusercontent.com/vibex-ai/vibex-plugin/main/dist/index.json`
- `https://cdn.jsdelivr.net/gh/vibex-ai/vibex-plugin@main/dist/index.json`

A build may point somewhere else with `VIBEX_PLUGIN_INDEX` (comma-separated).

## Submitting a plugin

1. Build and sign the package with the `vibex-plugin` CLI:

   ```sh
   vibex-plugin pack ./my-plugin
   vibex-plugin sign my-plugin.vplug --key "$PUBLISHER_KEY"
   ```

2. Host the `.vplug` somewhere stable and immutable — a GitHub Release is
   the usual choice — and note its SHA-256.

3. Add `plugins/<publisher>/<id>/plugin.json`:

   ```json
   {
     "entry": {
       "id": "com.example.widgets",
       "name": "Widgets",
       "kind": "script",
       "listingSource": "index",
       "publisher": { "id": "example", "displayName": "Example", "verified": true },
       "categories": ["panels"],
       "latestVersion": "1.2.0",
       "license": "MIT",
       "trust": "community"
     },
     "versions": [
       {
         "version": "1.2.0",
         "url": "https://github.com/example/vibex-widgets/releases/download/v1.2.0/com.example.widgets-1.2.0.vplug",
         "sizeBytes": 12345,
         "sha256": "…",
         "sha512": "…"
       }
     ]
   }
   ```

   `url` may also be `github:owner/repo`, which installs the repository's
   archive at the pinned commit.

4. If the package is signed by a publisher key, add that public key to
   `publisher-keys.json` as `{ "keyId": "…", "publicKey": "…" }` and set
   `publisherKeyId` on the entry. A version whose signature names a key the
   index does not carry is refused, and only then does an install count as
   **Verified**.

5. Open a pull request. CI runs `vibex-plugin index validate --catalog .` on
   every entry: the id, the version list, the hashes, the screenshot and icon
   addresses, and the JSON itself.

## First-party plugins

`plugins/vibex/todo/plugin.json` is the worked example. Its package lives at
`packages/dev.vibex.todo-1.0.0.vplug` and the entry pins its `sha256`, so the
index is what makes the download trustworthy: the client checks the hash it
read from the signed index, not one the package claims for itself.

Rebuilding it:

```sh
vibex-plugin pack examples/dev.vibex.todo \
  --output packages/dev.vibex.todo-1.0.0.vplug
vibex-plugin hash packages/dev.vibex.todo-1.0.0.vplug   # update sha256/sha512
```

## What CI does

- **Pull request** — validate only. A contributor cannot build a revision.
- **Installing the tool** — `cargo install --git ... --branch "$VIBEX_PLUGIN_TOOL_REF"`
  (default `feat/plugin-market`, override with a repository variable), because
  `vibex-plugin` ships on that branch before it reaches `main`. An unpinned
  install would start failing the moment the branch is rebased.
- **Push to `main`** — build and sign `dist/index.json` and the revocation
  list, then commit `dist/` back. The revision only ever grows, so a replayed
  older index cannot roll a catalog back.

The signing seed lives in the repository secret `PLUGIN_ROOT_KEY_SEED` (the
base64 seed `vibex-plugin keygen` prints). Without it the build skips with a
warning rather than publishing an unsigned index. The matching **public** key
is embedded in the desktop at release time through `VIBEX_PLUGIN_ROOT_KEY`; a
release without it refuses to load any index.

There is no self-asserted "official": a trust tier comes from the signed index
and a verified package signature, never from the entry's own JSON.

## Revocations

`revocations.json` blocks an id, or specific versions of it:

```json
{
  "schema": 1,
  "revision": 3,
  "blockedPlugins": [
    { "id": "com.example.bad", "versions": [], "reason": "abandoned" },
    {
      "id": "com.example.widgets",
      "versions": ["1.0.0"],
      "reason": "unsafe",
      "advisoryUrl": "https://…"
    }
  ]
}
```

An empty `versions` list blocks every version. CI copies and signs this file
into `dist/`, and the client only accepts a higher `revision`.

## Building locally

```sh
cargo install --git https://github.com/vibex-ai/vibex --locked vibex-plugin

# Check the entries without signing:
vibex-plugin index validate --catalog .

# Build a development index against a throwaway key:
vibex-plugin keygen --output /tmp/dev-key.txt
vibex-plugin index build --catalog . --key "$(sed -n 's/^private=//p' /tmp/dev-key.txt)"
```

A development index is unsigned for release builds; point a development
desktop at it with `VIBEX_PLUGIN_INDEX` and
`VIBEX_PLUGIN_ALLOW_UNVERIFIED_INDEX=1`.
