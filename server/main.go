package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

//go:embed all:dist
var distFS embed.FS

func main() {
	addr := flag.String("addr", envOr("PULSE_ADDR", ":8080"), "listen address")
	dbPath := flag.String("db", envOr("PULSE_DB", "pulse.db"), "sqlite database path")
	flag.Parse()

	db, err := openDB(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogStatus: true, LogURIPath: true, LogMethod: true,
		Skipper: func(c echo.Context) bool { return !strings.HasPrefix(c.Request().URL.Path, "/api") },
		LogValuesFunc: func(c echo.Context, v middleware.RequestLoggerValues) error {
			log.Printf("%s %s %d", v.Method, v.URIPath, v.Status)
			return nil
		},
	}))

	api := &API{db: db, hub: newHub(db)}
	api.register(e.Group("/api"))
	registerDocs(e)
	e.GET("/healthz", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })

	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatal(err)
	}
	e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		Filesystem: http.FS(dist),
		HTML5:      true,
		Skipper: func(c echo.Context) bool {
			return strings.HasPrefix(c.Request().URL.Path, "/api")
		},
	}))

	log.Printf("UCS Interactive listening on %s", *addr)
	if err := e.Start(*addr); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
