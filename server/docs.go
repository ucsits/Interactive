package main

import (
	_ "embed"
	"net"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

var (
	//go:embed docs/openapi.json
	openapiDoc string
	//go:embed docs/llms.txt
	llmsDoc string
	//go:embed docs/swagger.html
	swaggerPage string
)

// baseURL is the public origin of this request, so the docs agents read carry
// absolute URLs that work wherever the app is deployed.
func baseURL(c echo.Context) string {
	scheme := c.Scheme()
	host := c.Request().Host
	if scheme == "http" && c.Request().Header.Get("X-Forwarded-Proto") == "" {
		name := host
		if h, _, err := net.SplitHostPort(host); err == nil {
			name = h
		}
		if name != "localhost" && net.ParseIP(name) == nil {
			scheme = "https"
		}
	}
	return scheme + "://" + host
}

func registerDocs(e *echo.Echo) {
	withBase := func(doc, mime string) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Header().Set("Access-Control-Allow-Origin", "*")
			return c.Blob(http.StatusOK, mime, []byte(strings.ReplaceAll(doc, "__BASE_URL__", baseURL(c))))
		}
	}
	e.GET("/api/openapi.json", withBase(openapiDoc, "application/json"))
	e.GET("/llms.txt", withBase(llmsDoc, "text/plain; charset=utf-8"))
	e.GET("/api/llms.txt", withBase(llmsDoc, "text/plain; charset=utf-8"))
	e.GET("/api/docs", func(c echo.Context) error { return c.HTML(http.StatusOK, swaggerPage) })
	e.GET("/api", func(c echo.Context) error { return c.Redirect(http.StatusFound, "/api/docs") })
}
