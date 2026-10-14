# Fork snapshots

These branches preserve the current catalog and thinking work for review in the user's own forks. No upstream pull request, package release, or deployment is included.

| Fork branch | Base | Contents |
| --- | --- | --- |
| `Alecto1b/omniroute-agent-extension:fix/configured-model-sync` | `d4c1160` / package 3.2.3 | Configured canonical catalog sync, chat filtering, invalid-catalog protection, effective thinking-map consumption, shared HTTP tests, local diagnostics, and documentation. |
| `Alecto1b/omniroute-agent-extension:fix/pi-2.0.1-thinking-controls` | `ba775a6` / package 2.0.1 | Snapshot of the active prompt-tool extension, including prior local prompt-protocol customizations. This is separate from the native multi-host implementation. |
| `Alecto1b/OmniRoute:fix/effective-thinking-controls` | `v3.8.51` / `c1e30b76` | Installed-version server source patch for effective catalog controls, Codex max preservation, and Kiro adaptive profiles/output caps. An upstream PR would first need reconciliation with its active release branch. |

The regular extension checks are `npm test`, `npm run typecheck`, and `npm run smoke`. Installation-specific scripts intentionally exercise the installed Pi extension/router and are not part of CI. `verify-universal-thinking.mjs` accepts `OMNI_EXTENSION_PATH`, `PI_HOST_ROOT`, and `OMNIROUTE_SOURCE_ROOT` to verify another local checkout without editing the script. It uses scratch config and no paid inference.

Real models.json, credentials, account databases, call logs, backups, node_modules, and patched compiled server chunks stay outside these commits. Source changes are published; an ordinary upstream build produces the distribution. Local sync also refreshed some token/context metadata, as recorded in the local review; the private generated configuration is not a contribution artifact.

The changes remain review branches. Successful local focused tests do not claim that the entire OmniRoute CI/build matrix has run. Pi core and Pi AI have no source changes in this work.
