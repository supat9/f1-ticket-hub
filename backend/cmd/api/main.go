package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		if os.Getenv("VERCEL") == "1" {
			return errors.New("DATABASE_URL must be configured on Vercel")
		}
		databaseURL = "postgres://f1:f1_local_dev@127.0.0.1:5433/f1?sslmode=disable"
	}

	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
		if port := os.Getenv("PORT"); port != "" {
			addr = ":" + port
		}
	}

	db, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		return errors.New("invalid PostgreSQL connection configuration")
	}
	defer db.Close()

	if len(os.Args) > 1 {
		if (len(os.Args) == 3 || len(os.Args) == 4) && os.Args[1] == "create-user" {
			role := roleCS
			if len(os.Args) == 4 {
				role = os.Args[3]
			}
			return createUser(db, os.Args[2], role)
		}
		return errors.New("usage: api [create-user <email> [admin|cs|dev]]")
	}

	router := gin.Default()
	if err := router.SetTrustedProxies(nil); err != nil {
		return err
	}
	router.GET("/healthz", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"database": "unavailable"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"database": "connected"})
	})
	auth, err := newAuth(db)
	if err != nil {
		return err
	}
	router.POST("/api/auth/login", auth.login)
	router.DELETE("/api/auth/session", auth.logout)
	line := newLineService(db)
	router.POST("/api/line/webhook", line.webhook)
	registerTicketAutomation(router, db)
	registerTicketMCP(router, db)

	private := router.Group("/api", auth.requireSession)
	private.GET("/auth/session", auth.session)
	private.POST("/auth/dev-token", requireRoles(roleDev), issueDevToken(db))
	private.DELETE("/auth/dev-token", requireRoles(roleDev), revokeDevToken(db))
	private.GET("/staff", listStaff(db))
	private.GET("/notifications", listNotifications(db))
	private.PATCH("/notifications", readNotifications(db))
	private.GET("/line", line.status)
	private.POST("/line/pairing", line.createPairing)
	private.DELETE("/line", line.disconnect)
	private.GET("/tickets", listTickets(db))
	private.GET("/tickets/board", ticketBoard(db))
	private.GET("/tickets/summary", ticketSummary(db))
	private.GET("/tickets/report", ticketReport(db))
	private.GET("/tickets/export", requireRoles(roleAdmin, roleCS), exportTickets(db))
	private.GET("/tickets/:id", getTicket(db))
	private.GET("/tickets/:id/images", listTicketImages(db))
	private.GET("/tickets/:id/workflow", loadTicketWorkflow(db))
	private.GET("/tickets/:id/images/:imageId", getTicketImage(db))
	private.POST("/tickets", requireRoles(roleAdmin, roleCS), createTicket(db))
	private.POST("/tickets/:id/images", requireRoles(roleAdmin, roleCS), addTicketImage(db))
	private.POST("/tickets/:id/notes", addTicketNote(db))
	private.PATCH("/tickets/:id/details", requireRoles(roleAdmin, roleCS), updateTicketDetails(db))
	private.PATCH("/tickets/:id/assignment", requireRoles(roleAdmin, roleCS), updateTicketAssignment(db))
	private.PATCH("/tickets/:id/status", updateTicketStatus(db))
	private.PATCH("/tickets/:id/workflow", updateTicketWorkflow(db))

	admin := private.Group("/admin", requireRoles(roleAdmin))
	admin.GET("/users", listUsers(db))
	admin.POST("/users", addUser(db))
	admin.PATCH("/users/:id/role", updateUserRole(db))
	admin.PATCH("/users/:id/password", resetEmployeePassword(db))

	server := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
	}

	if line.enabled() {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go line.runDelivery(ctx)
	}
	log.Printf("API listening at http://%s", addr)
	return server.ListenAndServe()
}
