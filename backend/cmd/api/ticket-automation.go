package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type automationStatusInput struct {
	RequestID      string `json:"requestId"`
	ExpectedStatus string `json:"expectedStatus"`
	Status         string `json:"status"`
	Evidence       string `json:"evidence"`
}

type automationStatusResult struct {
	Code    string `json:"code"`
	Status  string `json:"status"`
	Changed bool   `json:"changed"`
}

var errAutomationStatusConflict = errors.New("ticket status differs from expectedStatus")
var errAutomationRequestConflict = errors.New("requestId was already used for a different update")

const automationTicketMatch = `id = $1 AND code = $2 AND (owner_id = $3 OR assignee_id = $3)`

func applyAutomatedStatus(ctx context.Context, db *pgxpool.Pool, id, actorID int64, result *automationStatusResult, input automationStatusInput, standaloneOnly bool) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var guided bool
		if err := tx.QueryRow(ctx, "SELECT status, handoff_steps <> '' FROM tickets WHERE "+automationTicketMatch+" FOR UPDATE",
			id, result.Code, actorID).Scan(&result.Status, &guided); err != nil {
			return err
		}

		// Serialize with other writers and check the receipt before touching a reopened ticket.
		previous := automationStatusInput{RequestID: input.RequestID}
		err := tx.QueryRow(ctx, `
			SELECT previous_status, status, evidence FROM ticket_status_automation
			WHERE ticket_id = $1 AND actor_id = $2 AND request_id = $3`, id, actorID, input.RequestID,
		).Scan(&previous.ExpectedStatus, &previous.Status, &previous.Evidence)
		if err == nil {
			if previous != input {
				return errAutomationRequestConflict
			}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if standaloneOnly && guided {
			return errUseHandoff
		}
		if result.Status != input.ExpectedStatus {
			return errAutomationStatusConflict
		}
		if err := setTicketWriteContext(ctx, tx, actorID, "automation", ""); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "UPDATE tickets SET status = $2 WHERE id = $1", id, input.Status); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH receipt AS (
				INSERT INTO ticket_status_automation (ticket_id, actor_id, request_id, previous_status, status, evidence)
				VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at
			)
			INSERT INTO ticket_activity (ticket_id, actor_id, kind, previous_status, status, detail, automation_id, created_at)
			SELECT $1, $2, 'automation', $4, $5, $6, id, created_at FROM receipt`, id, actorID, input.RequestID, input.ExpectedStatus, input.Status, input.Evidence,
		); err != nil {
			return err
		}
		result.Status = input.Status
		result.Changed = true
		return nil
	})
}

func automationTicket(c *gin.Context) (int64, string, bool) {
	code := strings.ToUpper(c.Param("code"))
	id := ticketCodeID(code)
	if !strings.HasPrefix(code, "F1-") || id == nil {
		ticketError(c, http.StatusBadRequest, "Provide an exact Job ID such as F1-000123")
		return 0, "", false
	}
	return *id, code, true
}

func issueDevToken(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		sessionHash, ok := bearerHash(c)
		if !ok {
			authError(c, http.StatusUnauthorized)
			return
		}
		var secret [32]byte
		rand.Read(secret[:])
		token := base64.RawURLEncoding.EncodeToString(secret[:])
		hash := sha256.Sum256([]byte(token))
		var expires time.Time
		err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
			var userID int64
			if err := tx.QueryRow(ctx, "SELECT id FROM app_users WHERE id = $1 AND role = 'dev' FOR SHARE",
				c.GetInt64("userID")).Scan(&userID); err != nil {
				return err
			}
			return tx.QueryRow(ctx, `
				INSERT INTO dev_automation_tokens (user_id, token_hash, expires_at)
				SELECT user_id, $2, now() + interval '90 days' FROM app_sessions
				WHERE user_id = $1 AND token_hash = $3 AND expires_at > now()
				ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
				RETURNING expires_at`, userID, hash[:], sessionHash[:]).Scan(&expires)
		})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			authError(c, http.StatusUnauthorized)
		case err != nil:
			authDatabaseError(c, err)
		default:
			c.JSON(http.StatusCreated, gin.H{"token": token, "expiresAt": expires})
		}
	}
}

func revokeDevToken(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		if _, err := db.Exec(ctx, "DELETE FROM dev_automation_tokens WHERE user_id = $1", c.GetInt64("userID")); err != nil {
			authDatabaseError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func requireDevToken(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		hash, ok := bearerHash(c)
		if !ok {
			c.Abort()
			authError(c, http.StatusUnauthorized)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		var id int64
		err := db.QueryRow(ctx, `
			SELECT u.id FROM dev_automation_tokens t JOIN app_users u ON u.id = t.user_id
			WHERE t.token_hash = $1 AND t.expires_at > now() AND u.role = 'dev'`, hash[:]).Scan(&id)
		if err != nil {
			c.Abort()
			if errors.Is(err, pgx.ErrNoRows) {
				authError(c, http.StatusUnauthorized)
			} else {
				authDatabaseError(c, err)
			}
			return
		}
		c.Set("userID", id)
	}
}

func registerTicketAutomation(router *gin.Engine, db *pgxpool.Pool) {
	api := router.Group("/api/automation/tickets", requireDevToken(db))
	api.GET("/:code/status", func(c *gin.Context) {
		id, code, ok := automationTicket(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		var status string
		err := db.QueryRow(ctx, "SELECT status FROM tickets WHERE "+automationTicketMatch,
			id, code, c.GetInt64("userID")).Scan(&status)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketError(c, http.StatusNotFound, "Ticket not found")
		case err != nil:
			ticketDatabaseError(c, "read automation status", err)
		default:
			c.JSON(http.StatusOK, gin.H{"code": code, "status": status})
		}
	})
	api.PATCH("/:code/status", func(c *gin.Context) {
		id, code, ok := automationTicket(c)
		if !ok {
			return
		}
		var input automationStatusInput
		if !decodeJSONWithLimit(c, &input, 8<<10) {
			return
		}
		input.RequestID = strings.TrimSpace(input.RequestID)
		input.Evidence = strings.TrimSpace(input.Evidence)
		if !validTicketText(input.RequestID, 128) || !validTicketText(input.Evidence, 1000) {
			ticketError(c, http.StatusBadRequest, "Provide a requestId and evidence for the status change")
			return
		}
		if !slices.Contains(ticketStatuses, input.ExpectedStatus) || !slices.Contains(ticketStatuses, input.Status) ||
			input.ExpectedStatus == input.Status {
			ticketError(c, http.StatusBadRequest, "Provide different valid values for status and expectedStatus")
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		result := automationStatusResult{Code: code}
		err := applyAutomatedStatus(ctx, db, id, c.GetInt64("userID"), &result, input, false)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketError(c, http.StatusNotFound, "Ticket not found")
		case errors.Is(err, errAutomationStatusConflict), errors.Is(err, errAutomationRequestConflict):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": code, "status": result.Status})
		case err != nil:
			ticketDatabaseError(c, "write automation status", err)
		default:
			c.JSON(http.StatusOK, result)
		}
	})
}
