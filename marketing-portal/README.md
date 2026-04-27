# AHRI Marketing Command Center — marketing-portal/

## Railway deployment note

Railway deploys only the `marketing-portal/` subdirectory as the service root (`/app`).
Files outside this folder do not exist in the container.

The following directories are **copies** of their repo-root equivalents and must be kept in sync manually until an automated sync is in place:

| Copied path (in marketing-portal/) | Source (repo root) |
|---|---|
| `distribution/queue/pending-review/` | `distribution/queue/pending-review/` |
| `distribution/queue/ready-to-post/` | `distribution/queue/ready-to-post/` |
| `intelligence-db/assets/` | `intelligence-db/assets/` |
| `performance/asset-log.csv` | `performance/asset-log.csv` |
| `manus-tasks/` | `manus-tasks/` |

**When AHRI generates new assets locally:** copy them to both the repo-root location and the corresponding `marketing-portal/` location, then commit both. Future: automate this sync.

Asset directories under `marketing-portal/distribution/`, `intelligence-db/`, and `performance/` are copies of the repo root directories. When AHRI generates new assets locally, copy them to both locations and commit. Future: automate this sync.
