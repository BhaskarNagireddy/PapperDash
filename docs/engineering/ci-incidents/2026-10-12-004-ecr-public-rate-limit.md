# The Docker build was refused its base image by AWS's public registry (429 rate limit)

| Field | Value |
| --- | --- |
| ID | 2026-10-12-004 |
| Date | 2026-10-12 |
| Check (job) | Docker image (build, boot, vulnerability scan) |
| Step | Build the image |
| Run | [CI #29](https://github.com/BhaskarNagireddy/PapperDash/actions/runs/38243142172), job 114790421687 |
| Commit | aa21e3a (PR #7, pin CI to ubuntu-24.04) |
| Category | infrastructure |
| Status | fixed (fallback added) |

## What was seen
```
#5 [internal] load metadata for public.ecr.aws/docker/library/node:22-bookworm-slim
#5 ERROR: ... unexpected status code https://public.ecr.aws/v2/docker/library/node/manifests/sha256:c3de60bf...:
   429 Too Many Requests - Server message: toomanyrequests: Data limit exceeded
Dockerfile:19  >>> FROM public.ecr.aws/docker/library/node:22-bookworm-slim
ERROR: failed to build
```
The job failed 2 seconds into the build, before any of our code was compiled.

## Root cause
- **Proven by the log:** AWS's public registry (`public.ecr.aws`) refused to send the Node base image with HTTP 429, "Data limit exceeded".
- **Inferred:** anonymous downloads from that registry are limited per address, and GitHub's runners share addresses with many other projects, so the limit can be reached by others' traffic. Our runs earlier the same day pulled the same image without problems.
- **Not the cause:** the commit that ran only pinned the runner to `ubuntu-24.04`. The image comes from the registry, not from the runner's OS.

## Modules affected
- **Affected:** only the CI "Docker image" job, at the base-image download.
- **Not affected:** application code, tests, the other five checks, production.

## Fix
- **`services/core/Dockerfile`:** the base image is now a build argument, `NODE_IMAGE`, defaulting to the AWS mirror as before.
- **`.github/scripts/build-image.sh`,** used by the CI job:
  - tries the AWS mirror twice, then Docker Hub (`docker.io/library/node:22-bookworm-slim`, the same official image);
  - waits between attempts and logs which source was used;
  - ends with a clear "registry limit, not code" error if every source fails.
- **CI:** the build step now has a 15-minute limit.

## Prevention
- No single registry outage or limit can block the check any more.
- **If both registries limit us often, the next step is to authenticate pulls:** a Docker Hub token as a repository secret, or pulling through our own ECR once the AWS account exists (roadmap step 4). Authenticated pulls have much higher limits.
- **Production deploys are unaffected,** because they will pull from our private ECR.

## How it was verified
- **Locally:** the workflow parses as valid YAML and the script passes `bash -n`. Docker registries are not reachable from the assistant's container, so the build itself is verified in CI.
- **CI:** the next push to PR #7 runs the new script. Its log shows the base image source used.
