.PHONY: dev-server dev-web build run docker clean

# Run the Go API on :8080, pair it with `make dev-web` for hot reload.
dev-server:
	cd server && go run . -db ../pulse.db

# Vite dev server on :5173, proxies /api (including websockets) to :8080.
dev-web:
	cd web && npm run dev -- --host

build:
	cd web && npm ci && npm run build
	cd server && CGO_ENABLED=0 go build -trimpath -o ../bin/pulse .

run: build
	./bin/pulse -db pulse.db

docker:
	docker compose up --build -d

clean:
	rm -rf bin server/dist/assets server/dist/index.html
