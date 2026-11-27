package main

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type assignmentNotification struct {
	ID        string    `json:"id"`
	TicketID  string    `json:"ticketId"`
	Code      string    `json:"code"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
	Read      bool      `json:"read"`
}

func listNotifications(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		rows, err := db.Query(ctx, `
			SELECT n.id::text, n.ticket_id::text, t.code, t.title, n.created_at, n.read_at IS NOT NULL,
				(SELECT count(*) FROM assignment_notifications WHERE recipient_id = $1 AND read_at IS NULL)
			FROM assignment_notifications n
			JOIN tickets t ON t.id = n.ticket_id
			WHERE n.recipient_id = $1
			ORDER BY n.id DESC
			LIMIT 20`, c.GetInt64("userID"))
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		var unread int64
		items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (assignmentNotification, error) {
			var item assignmentNotification
			err := row.Scan(&item.ID, &item.TicketID, &item.Code, &item.Title, &item.CreatedAt, &item.Read, &unread)
			return item, err
		})
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		c.JSON(http.StatusOK, gin.H{"items": items, "unread": unread})
	}
}

func readNotifications(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			ID      string `json:"id"`
			Through string `json:"through"`
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		if err := c.ShouldBindJSON(&input); err != nil || (input.ID == "") == (input.Through == "") {
			authError(c, http.StatusBadRequest)
			return
		}
		markAll := input.Through != ""
		value := input.ID
		if markAll {
			value = input.Through
		}
		id, ok := positiveID(value)
		if !ok {
			authError(c, http.StatusBadRequest)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		_, err := db.Exec(ctx, `
			UPDATE assignment_notifications SET read_at = clock_timestamp()
			WHERE recipient_id = $1 AND read_at IS NULL AND (id = $2 OR ($3 AND id < $2))`,
			c.GetInt64("userID"), id, markAll)
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	}
}
