package main

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const activityPageSize = 30

type ticketActivity struct {
	ID             string    `json:"id"`
	Actor          string    `json:"actor"`
	Kind           string    `json:"kind"`
	PreviousStatus string    `json:"previousStatus"`
	Status         string    `json:"status"`
	Detail         string    `json:"detail"`
	CreatedAt      time.Time `json:"createdAt"`
}

type workflowView struct {
	Steps          string           `json:"steps"`
	Impact         string           `json:"impact"`
	Resolution     string           `json:"resolution"`
	PullRequestURL string           `json:"pullRequestUrl"`
	ReviewNote     string           `json:"reviewNote"`
	Version        int32            `json:"version"`
	Activity       []ticketActivity `json:"activity"`
	NextBefore     *string          `json:"nextBefore"`
}

func loadTicketWorkflow(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := workflowTicketID(c)
		if !ok {
			return
		}
		var before *int64
		if value, present := c.GetQuery("before"); present {
			cursor, ok := positiveID(value)
			if !ok {
				ticketError(c, http.StatusBadRequest, "รหัสหน้าประวัติไม่ถูกต้อง")
				return
			}
			before = &cursor
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		var result workflowView
		err := db.QueryRow(ctx, `WITH visible AS (SELECT * FROM tickets WHERE `+ticketVisibility+` AND id = $3)
			SELECT handoff_steps, handoff_impact, resolution_summary, pull_request_url, review_note, workflow_version,
			COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.id::bigint DESC) FROM (
				SELECT a.id::text, coalesce(u.email, '') AS actor, a.kind, a.previous_status AS "previousStatus", a.status, a.detail, a.created_at AS "createdAt"
				FROM ticket_activity a LEFT JOIN app_users u ON u.id = a.actor_id
				WHERE a.ticket_id = visible.id AND ($4::bigint IS NULL OR a.id < $4) ORDER BY a.id DESC LIMIT $5
			) AS event), '[]'::jsonb) FROM visible`,
			c.GetInt64("userID"), canManageTickets(c), id, before, activityPageSize+1).
			Scan(&result.Steps, &result.Impact, &result.Resolution, &result.PullRequestURL, &result.ReviewNote, &result.Version, &result.Activity)
		if workflowResponseError(c, err, "load workflow") {
			return
		}
		if len(result.Activity) > activityPageSize {
			result.Activity = result.Activity[:activityPageSize]
			result.NextBefore = &result.Activity[activityPageSize-1].ID
		}
		c.JSON(http.StatusOK, result)
	}
}

type workflowInput struct {
	Action         string `json:"action"`
	AssigneeID     string `json:"assigneeId"`
	Steps          string `json:"steps"`
	Impact         string `json:"impact"`
	Resolution     string `json:"resolution"`
	PullRequestURL string `json:"pullRequestUrl"`
	ReviewNote     string `json:"reviewNote"`
	Version        *int32 `json:"version"`
}

var errWorkflowConflict = errors.New("workflow has changed")
var errWorkflowForbidden = errors.New("workflow action forbidden")
var errWorkflowAssignee = errors.New("workflow assignee must be a developer")

func (input *workflowInput) validate() string {
	if input.Version == nil || *input.Version < 0 {
		return "กรุณาโหลดสถานะล่าสุดก่อนบันทึก"
	}
	input.Steps = strings.TrimSpace(input.Steps)
	input.Impact = strings.TrimSpace(input.Impact)
	input.Resolution = strings.TrimSpace(input.Resolution)
	input.PullRequestURL = strings.TrimSpace(input.PullRequestURL)
	input.ReviewNote = strings.TrimSpace(input.ReviewNote)
	switch input.Action {
	case "handoff":
		if _, ok := positiveID(input.AssigneeID); !ok || !validTicketText(input.Steps, 2000) || !validTicketText(input.Impact, 1200) {
			return "กรุณาเลือก Dev และระบุวิธีทำซ้ำกับผลกระทบ"
		}
	case "start":
	case "submit":
		if !validTicketText(input.Resolution, 2000) {
			return "กรุณาระบุผลการแก้ไขหรือหลักฐานที่ตรวจสอบได้"
		}
		if input.PullRequestURL != "" {
			parsed, err := url.ParseRequestURI(input.PullRequestURL)
			if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || len(input.PullRequestURL) > 500 {
				return "ลิงก์ Pull request ต้องเป็น HTTPS ที่ถูกต้อง"
			}
		}
	case "close", "return":
		if !validTicketText(input.ReviewNote, 2000) {
			return "กรุณาระบุผลการตรวจรับหรือสิ่งที่ต้องแก้เพิ่มเติม"
		}
	default:
		return "ขั้นตอนการทำงานไม่ถูกต้อง"
	}
	return ""
}

func updateTicketWorkflow(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := workflowTicketID(c)
		if !ok {
			return
		}
		var input workflowInput
		if !decodeTicketJSON(c, &input) {
			return
		}
		if message := input.validate(); message != "" {
			ticketError(c, http.StatusBadRequest, message)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		actor, manager := c.GetInt64("userID"), canManageTickets(c)
		err := applyVisibleWorkflow(ctx, db, id, actor, manager, c.GetString("userRole"), input)
		if !workflowResponseError(c, err, "update workflow") {
			c.Status(http.StatusNoContent)
		}
	}
}

func applyVisibleWorkflow(ctx context.Context, db *pgxpool.Pool, id, actor int64, manager bool, role string, input workflowInput) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var status, steps string
		var assignee *int64
		var version int32
		if err := tx.QueryRow(ctx, `SELECT status, handoff_steps, assignee_id, workflow_version FROM tickets WHERE `+ticketVisibility+` AND id = $3 FOR UPDATE`,
			actor, manager, id).Scan(&status, &steps, &assignee, &version); err != nil {
			return err
		}
		if version != *input.Version {
			return errWorkflowConflict
		}
		if input.Action == "start" || input.Action == "submit" {
			if role != roleDev || assignee == nil || *assignee != actor {
				return errWorkflowForbidden
			}
		} else if !manager {
			return errWorkflowForbidden
		}
		return applyWorkflowAction(ctx, tx, id, actor, status, steps != "", input)
	})
}

func applyWorkflowAction(ctx context.Context, tx pgx.Tx, id, actor int64, status string, guided bool, input workflowInput) error {
	var query, detail string
	var args []any
	action := input.Action
	switch action {
	case "handoff":
		if status != "open" && status != "in_progress" {
			return errWorkflowConflict
		}
		assignee, _ := positiveID(input.AssigneeID)
		var devEmail string
		if err := tx.QueryRow(ctx, "SELECT email FROM app_users WHERE id = $1 AND role = 'dev' FOR SHARE", assignee).Scan(&devEmail); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errWorkflowAssignee
			}
			return err
		}
		query = `UPDATE tickets SET handoff_steps = $2, handoff_impact = $3, assignee_id = $4, assignee_name = '',
			assignment_version = assignment_version + CASE WHEN (assignee_id, assignee_name) IS DISTINCT FROM ($4::bigint, ''::text) THEN 1 ELSE 0 END,
			workflow_version = workflow_version + 1 WHERE id = $1`
		args = []any{id, input.Steps, input.Impact, assignee}
		detail = "Dev: " + devEmail + "\n" + input.Impact
	case "start":
		if !guided || status != "open" {
			return errWorkflowConflict
		}
		query, args = `UPDATE tickets SET status = 'in_progress', workflow_version = workflow_version + 1 WHERE id = $1`, []any{id}
		action = ""
	case "submit":
		if !guided || status != "in_progress" {
			return errWorkflowConflict
		}
		query = `UPDATE tickets SET status = 'resolved', resolution_summary = $2, pull_request_url = $3,
			review_note = '', workflow_version = workflow_version + 1 WHERE id = $1`
		args = []any{id, input.Resolution, input.PullRequestURL}
		detail = strings.TrimSpace(input.Resolution + "\n" + input.PullRequestURL)
	case "close", "return":
		if !guided || status != "resolved" {
			return errWorkflowConflict
		}
		next := "closed"
		if action == "return" {
			next = "in_progress"
		}
		query, args = `UPDATE tickets SET status = $2, review_note = $3, workflow_version = workflow_version + 1 WHERE id = $1`, []any{id, next, input.ReviewNote}
		detail = input.ReviewNote
	}
	if err := setTicketWriteContext(ctx, tx, actor, action, detail); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, query, args...)
	return err
}

func addTicketNote(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := workflowTicketID(c)
		if !ok {
			return
		}
		var input struct {
			Note string `json:"note"`
		}
		if !decodeTicketJSON(c, &input) {
			return
		}
		input.Note = strings.TrimSpace(input.Note)
		if !validTicketText(input.Note, 2000) {
			ticketError(c, http.StatusBadRequest, "กรุณาระบุบันทึกภายในไม่เกิน 2,000 ตัวอักษร")
			return
		}
		var key pgtype.UUID
		if value := c.GetHeader("Idempotency-Key"); value != "" {
			if err := key.Scan(value); err != nil {
				ticketError(c, http.StatusBadRequest, "Idempotency-Key ต้องเป็น UUID")
				return
			}
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		saved, err := saveTicketNote(ctx, db, id, c.GetInt64("userID"), canManageTickets(c), input.Note, key)
		if err == nil && !saved {
			ticketMutationConflict(c, ctx, db, id, "รหัสการบันทึกนี้ถูกใช้แล้ว กรุณาโหลดเคสใหม่")
			return
		}
		if !workflowResponseError(c, err, "add note") {
			c.Status(http.StatusCreated)
		}
	}
}

func workflowTicketID(c *gin.Context) (int64, bool) {
	id, ok := positiveID(c.Param("id"))
	if !ok {
		ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
	}
	return id, ok
}

func workflowResponseError(c *gin.Context, err error, operation string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, pgx.ErrNoRows):
		ticketError(c, http.StatusNotFound, "ไม่พบ Ticket นี้ในคิว")
	case errors.Is(err, errWorkflowConflict):
		ticketError(c, http.StatusConflict, "เคสเปลี่ยนขั้นตอนแล้ว กรุณาตรวจสอบข้อมูลล่าสุด")
	case errors.Is(err, errWorkflowForbidden):
		ticketError(c, http.StatusForbidden, "บัญชีนี้ไม่มีสิทธิ์ทำขั้นตอนนี้")
	case errors.Is(err, errWorkflowAssignee):
		ticketError(c, http.StatusBadRequest, "กรุณาเลือกผู้รับงานที่อยู่ในทีม Dev")
	default:
		ticketDatabaseError(c, operation, err)
	}
	return true
}

func saveTicketNote(ctx context.Context, db *pgxpool.Pool, id, actor int64, manager bool, note string, key pgtype.UUID) (bool, error) {
	result, err := db.Exec(ctx, `WITH visible AS (SELECT id FROM tickets WHERE `+ticketVisibility+` AND id = $3 FOR SHARE)
			INSERT INTO ticket_activity (ticket_id, actor_id, kind, detail, note_request_id)
			SELECT id, $1, 'note', $4, $5 FROM visible
			ON CONFLICT (ticket_id, actor_id, note_request_id) DO UPDATE SET note_request_id = EXCLUDED.note_request_id
			WHERE ticket_activity.detail = EXCLUDED.detail`, actor, manager, id, note, key)
	return result.RowsAffected() > 0, err
}
