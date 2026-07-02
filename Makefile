default: build-exeuntu

build-exeuntu: ## Build the exeuntu Docker image locally
	@echo "Building exeuntu Docker image..."
	docker build -t ghcr.io/boldsoftware/exeuntu:latest .
	@echo "✓ Image built locally as ghcr.io/boldsoftware/exeuntu:latest"

build: build-exeuntu

run: build-exeuntu
	docker run -it \
	  --cap-add=ALL \
	  --security-opt seccomp=unconfined \
	  --security-opt apparmor=unconfined \
	  --cgroupns private \
	  --tmpfs /run \
	  --tmpfs /run/lock \
	  --tmpfs /tmp \
	  --tmpfs /sys/fs/cgroup:rw \
	  ghcr.io/boldsoftware/exeuntu:latest

run-bash: build-exeuntu
	docker run -it \
	  --cap-add=ALL \
	  --security-opt seccomp=unconfined \
	  --security-opt apparmor=unconfined \
	  --cgroupns private \
	  --tmpfs /run \
	  --tmpfs /run/lock \
	  --tmpfs /tmp \
	  --tmpfs /sys/fs/cgroup:rw \
	  ghcr.io/boldsoftware/exeuntu:latest bash

test: ## Run Dockerfile/dotfiles contract tests on the host
	node --test "tests/*.test.mjs"

smoke: ## Run the in-image smoke test against the built image
	docker run --rm --user exedev -e HOME=/home/exedev \
	  ghcr.io/boldsoftware/exeuntu:latest /usr/local/bin/harperuntu-smoke
