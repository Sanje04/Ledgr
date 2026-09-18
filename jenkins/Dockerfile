FROM jenkins/jenkins:lts-jdk17
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg python3 python3-venv python3-pip \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/debian bookworm stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
 && curl -L "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
      -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# The `jenkins` user must be in the group that owns the host's docker socket, or
# every `docker` call in the pipeline fails with a permission error. If a group
# with that GID already exists (Docker Desktop's socket is root:root, GID 0),
# join it rather than failing on a duplicate GID.
ARG DOCKER_GID=988
RUN : "${DOCKER_GID:?DOCKER_GID build arg is empty}" \
 && if getent group "${DOCKER_GID}" >/dev/null; then \
      usermod -aG "$(getent group "${DOCKER_GID}" | cut -d: -f1)" jenkins; \
    else \
      groupadd -g "${DOCKER_GID}" hostdocker && usermod -aG hostdocker jenkins; \
    fi

USER jenkins