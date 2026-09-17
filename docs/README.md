# docs/

Design and specification documents for work that is **proposed but not yet
built**. Everything here describes a change; nothing here documents shipped
behaviour.

For shipped behaviour, see instead:

| Doc | Covers |
|---|---|
| [../README.md](../README.md) | What Tender is, how to run it |
| [../CLAUDE.md](../CLAUDE.md) | Operating manual + hard constraints |
| [../backend/specs.md](../backend/specs.md) | Backend phase log (Phases 1–8, shipped) |
| [../ui/specs.md](../ui/specs.md) | Frontend spec (shipped) |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | docker-compose deployment (shipped) |
| [../KUBERNETES_DEPLOYMENT.md](../KUBERNETES_DEPLOYMENT.md) | Oracle Cloud + k3s + Argo CD plan |

## Contents

| Doc | What it proposes | Status |
|---|---|---|
| [design.md](design.md) | Local Minikube cluster + Jenkins CI/CD pipeline on Windows 11, open-source toolchain throughout | Design only — no `Jenkinsfile` or `k8s/` manifests exist yet |
| [specs.md](specs.md) | Phase 9: switch the agent between Ollama and the Claude API via one `.env` key | Spec only — no code changed yet |

The two are related but independently buildable: the provider switch works the
same under `docker compose`, and the Minikube pipeline works the same on Ollama.
Read `design.md` first if you want the cluster; `specs.md` first if you want the
provider switch.
