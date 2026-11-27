package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const dueAtSQL = `(created_at + CASE priority WHEN 'urgent' THEN interval '4 hours' WHEN 'high' THEN interval '24 hours'
	WHEN 'normal' THEN interval '72 hours' ELSE interval '120 hours' END)`
const overdueSQL = `(status IN ('open', 'in_progress') AND ` + dueAtSQL + ` <= now())`
const dueSoonSQL = `(status IN ('open', 'in_progress') AND ` + dueAtSQL + ` > now() AND ` + dueAtSQL + ` <= now() + interval '24 hours')`
const triageSQL = `(status = 'open' AND handoff_steps = '')`
const reviewSQL = `(status = 'resolved' AND handoff_steps <> '')`

const ticketColumns = `id::text, code, title, description, source, priority, status,
	created_at AS "createdAt", owner_id::text AS "ownerId", assignee_id::text AS "assigneeId",
	assignment_version AS "assignmentVersion", customer_name AS "customerName", product, category, notes,
	details_version AS "detailsVersion", completed_at AS "completedAt", assignee_name AS "assigneeName",
	` + dueAtSQL + ` AS "dueAt", (handoff_steps <> '') AS "guidedWorkflow"`
const ticketPageSize = 25
const numberedTicketPageSize = 10
const ticketVisibility = `($2::boolean OR owner_id = $1::bigint OR assignee_id = $1)`
const ticketCriteria = ticketVisibility + ` AND ($3::text = '' OR id = $4::bigint OR strpos(lower(title), lower($3)) > 0)
	AND ($5::text = '' OR priority = $5) AND ($6::text = '' OR status = $6)
	AND ($7::text = '' OR created_at >= (NULLIF($7, '')::date::timestamp AT TIME ZONE 'Asia/Bangkok'))
	AND ($8::text = '' OR created_at < ((NULLIF($8, '')::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok'))`
const ticketFilter = ticketCriteria + ` AND (CASE $9::text
	WHEN 'mine' THEN owner_id = $1
	WHEN 'assigned' THEN assignee_id = $1
	WHEN 'unassigned' THEN assignee_id IS NULL AND assignee_name = ''
	WHEN 'triage' THEN ` + triageSQL + `
	WHEN 'review' THEN ` + reviewSQL + `
	WHEN 'due_soon' THEN ` + dueSoonSQL + `
	WHEN 'overdue' THEN ` + overdueSQL + `
	ELSE true END)`

var ticketPriorities = []string{"low", "normal", "high", "urgent"}

type ticket struct {
	ID             string     `json:"id"`
	Code           string     `json:"code"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	Source         string     `json:"source"`
	Priority       string     `json:"priority"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"createdAt"`
	OwnerID        *string    `json:"ownerId"`
	AssigneeID     *string    `json:"assigneeId"`
	Version        int32      `json:"assignmentVersion"`
	CustomerName   string     `json:"customerName"`
	Product        string     `json:"product"`
	Category       string     `json:"category"`
	Notes          string     `json:"notes"`
	DetailsVersion int32      `json:"detailsVersion"`
	CompletedAt    *time.Time `json:"completedAt"`
	AssigneeName   string     `json:"assigneeName"`
	DueAt          time.Time  `json:"dueAt"`
	GuidedWorkflow bool       `json:"guidedWorkflow"`
}

type ticketInput struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	Source       string `json:"source"`
	Priority     string `json:"priority"`
	OwnerID      string `json:"ownerId"`
	AssigneeID   string `json:"assigneeId"`
	AssigneeName string `json:"assigneeName"`
	ticketDetailsFields
	Image string `json:"image"`
}

func createTicket(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input ticketInput
		if !decodeJSONWithLimit(c, &input, ticketImageJSONLimit) {
			return
		}

		if message := input.validate(); message != "" {
			ticketError(c, http.StatusBadRequest, message)
			return
		}
		input.AssigneeName = strings.TrimSpace(input.AssigneeName)
		if !validAssigneeName(c, input.AssigneeID, input.AssigneeName) {
			return
		}
		image, message := parseTicketImage(input.Image)
		if message != "" {
			ticketError(c, http.StatusBadRequest, message)
			return
		}
		actorID := strconv.FormatInt(c.GetInt64("userID"), 10)
		if input.OwnerID == "" {
			input.OwnerID = actorID
		}
		ownerID, assigneeID, ok := staffSelection(c, input.OwnerID, input.AssigneeID)
		if !ok {
			return
		}
		// Keep the original request comparable even after staff assignment is changed.
		parts := []string{
			actorID, input.Title, input.Description, input.Source, input.Priority, input.OwnerID, input.AssigneeID,
		}
		if input.ticketDetailsFields != (ticketDetailsFields{}) || image.content != nil {
			productKey := input.Product
			if legacy, ok := legacyProductKeys[productKey]; ok {
				productKey = legacy
			}
			parts = append(parts, input.CustomerName, productKey, input.Category, input.Notes, string(image.digest))
		}
		if input.AssigneeName != "" {
			parts = append(parts, input.AssigneeName)
		}
		fingerprint := sha256.Sum256([]byte(strings.Join(parts, "\x00")))

		var requestID pgtype.UUID
		if key := c.GetHeader("Idempotency-Key"); key != "" {
			if err := requestID.Scan(key); err != nil {
				ticketError(c, http.StatusBadRequest, "Idempotency-Key ต้องเป็น UUID")
				return
			}
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		result, err := writeTicketRow(ctx, db, c.GetInt64("userID"), `
			WITH saved AS (
			INSERT INTO tickets (request_id, title, description, source, priority, owner_id, assignee_id, request_fingerprint,
				customer_name, product, category, notes, assignee_name)
			VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $16)
			ON CONFLICT (request_id) DO UPDATE SET request_id = EXCLUDED.request_id
			WHERE tickets.request_fingerprint = EXCLUDED.request_fingerprint
			   OR (tickets.request_fingerprint IS NULL AND
			       $9 = '' AND $10 = '' AND $11 = '' AND $12 = '' AND $15::bytea IS NULL AND $16 = '' AND
			       (tickets.title, tickets.description, tickets.source, tickets.priority) =
			       (EXCLUDED.title, EXCLUDED.description, EXCLUDED.source, EXCLUDED.priority))
			RETURNING `+ticketColumns+`
			), attached AS (
				INSERT INTO ticket_images (ticket_id, content_type, digest, content)
				SELECT id::bigint, $13, $14, $15 FROM saved WHERE $15::bytea IS NOT NULL
				ON CONFLICT (ticket_id, digest) DO NOTHING
			)
			SELECT * FROM saved`,
			requestID, input.Title, input.Description, input.Source, input.Priority, ownerID, assigneeID, fingerprint[:],
			input.CustomerName, input.Product, input.Category, input.Notes, image.contentType, image.digest, image.content, input.AssigneeName)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketError(c, http.StatusConflict, "รหัสการส่งนี้ใช้กับ Ticket อื่นแล้ว กรุณาเปิดแบบฟอร์มใหม่")
		case err != nil:
			assignmentDatabaseError(c, "create", err)
		default:
			c.JSON(http.StatusCreated, result)
		}
	}
}

func decodeTicketJSON(c *gin.Context, value any) bool {
	return decodeJSONWithLimit(c, value, 64<<10)
}

func decodeJSONWithLimit(c *gin.Context, value any, limit int64) bool {
	mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType != "application/json" {
		ticketError(c, http.StatusUnsupportedMediaType, "กรุณาส่งข้อมูลแบบ application/json")
		return false
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
	decoder := json.NewDecoder(c.Request.Body)
	if err := decoder.Decode(value); err != nil {
		ticketError(c, http.StatusBadRequest, "กรุณาส่งข้อมูล Ticket ในรูปแบบ JSON ที่ถูกต้อง")
		return false
	}
	if err := decoder.Decode(new(json.RawMessage)); !errors.Is(err, io.EOF) {
		ticketError(c, http.StatusBadRequest, "กรุณาส่งข้อมูล Ticket เพียงหนึ่งรายการ")
		return false
	}
	return true
}

func (input *ticketInput) validate() string {
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if input.Priority == "" {
		input.Priority = "normal"
	}

	switch {
	case !validTicketText(input.Title, 160):
		return "กรุณาระบุชื่อเคสที่มีความยาวไม่เกิน 160 ตัวอักษร"
	case !validTicketText(input.Description, 5000):
		return "กรุณาระบุรายละเอียดที่มีความยาวไม่เกิน 5,000 ตัวอักษร"
	case input.Source != "customer" && input.Source != "internal":
		return "กรุณาระบุว่าเป็นเรื่องที่ CS รับจากลูกค้าหรือเรื่องภายในองค์กร"
	}
	if slices.Contains(ticketPriorities, input.Priority) {
		return input.ticketDetailsFields.validate()
	}
	return "กรุณาเลือกระดับความเร่งด่วนที่ถูกต้อง"
}

func validTicketText(value string, maxLength int) bool {
	return value != "" && !strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= maxLength
}

func listTickets(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		filter, ok := queueFilter(c)
		if !ok {
			return
		}
		criteria, ok := readQueueCriteria(c)
		if !ok {
			return
		}
		if raw, exists := c.GetQuery("page"); exists {
			page, ok := positiveID(raw)
			if !ok || c.QueryArray("before") != nil {
				ticketError(c, http.StatusBadRequest, "page ต้องเป็นเลขหน้าที่มากกว่าศูนย์ และใช้แยกจาก before")
				return
			}
			listNumberedTickets(c, db, criteria, filter, page)
			return
		}
		var before *int64
		if cursor, exists := c.GetQuery("before"); exists {
			id, err := strconv.ParseInt(cursor, 10, 64)
			if err != nil || id < 1 {
				ticketError(c, http.StatusBadRequest, "before ต้องเป็นเลข Ticket ที่มากกว่าศูนย์")
				return
			}
			before = &id
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		rows, err := db.Query(ctx, `SELECT `+ticketColumns+`
			FROM tickets
			WHERE `+ticketFilter+` AND ($10::bigint IS NULL OR id < $10)
			ORDER BY id DESC
			LIMIT $11`, c.GetInt64("userID"), canManageTickets(c), criteria.query, ticketCodeID(criteria.query),
			criteria.priority, criteria.status, criteria.from, criteria.to, filter, before, ticketPageSize+1)
		if err != nil {
			ticketDatabaseError(c, "list", err)
			return
		}

		tickets, err := pgx.CollectRows(rows, pgx.RowToStructByPos[ticket])
		if err != nil {
			ticketDatabaseError(c, "list", err)
			return
		}

		tickets, nextCursor := paginateTickets(tickets, ticketPageSize)
		c.JSON(http.StatusOK, gin.H{"tickets": tickets, "nextCursor": nextCursor})
	}
}

func listNumberedTickets(c *gin.Context, db *pgxpool.Pool, criteria queueCriteria, filter string, page int64) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	var tickets []ticket
	var total, currentPage int64
	err := db.QueryRow(ctx, `
		WITH filtered AS NOT MATERIALIZED (SELECT * FROM tickets WHERE `+ticketFilter+`),
		     counts AS (SELECT count(*) AS total FROM filtered),
		     pagination AS (
		         SELECT total, LEAST($10::bigint, GREATEST(1, (total + $11::bigint - 1) / $11)) AS page
		         FROM counts
		     ),
		     items AS (
		         SELECT `+ticketColumns+` FROM filtered
	         ORDER BY CASE WHEN $9::text IN ('due_soon', 'overdue') THEN `+dueAtSQL+` END, filtered.id DESC
		         LIMIT $11 OFFSET (SELECT (page - 1) * $11 FROM pagination)
		     )
		SELECT total, page,
	       (SELECT COALESCE(jsonb_agg(to_jsonb(items) ORDER BY CASE WHEN $9::text IN ('due_soon', 'overdue') THEN items."dueAt" END, items.id::bigint DESC), '[]'::jsonb) FROM items)
		FROM pagination`, c.GetInt64("userID"), canManageTickets(c), criteria.query, ticketCodeID(criteria.query),
		criteria.priority, criteria.status, criteria.from, criteria.to, filter, page, numberedTicketPageSize,
	).Scan(&total, &currentPage, &tickets)
	if err != nil {
		ticketDatabaseError(c, "list numbered tickets", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"tickets": tickets, "page": currentPage, "pageSize": numberedTicketPageSize, "total": total})
}

func queueFilter(c *gin.Context) (string, bool) {
	filter := c.DefaultQuery("filter", "all")
	switch filter {
	case "all", "mine", "assigned", "unassigned", "triage", "review", "due_soon", "overdue":
		return filter, true
	default:
		ticketError(c, http.StatusBadRequest, "ตัวกรองคิวไม่ถูกต้อง")
		return "", false
	}
}

type queueCriteria struct {
	query, priority, status, from, to string
}

func readQueueCriteria(c *gin.Context) (queueCriteria, bool) {
	criteria := queueCriteria{
		query: strings.TrimSpace(c.Query("q")), priority: c.Query("priority"), status: c.Query("status"),
		from: c.Query("from"), to: c.Query("to"),
	}
	if !utf8.ValidString(criteria.query) || strings.ContainsRune(criteria.query, 0) {
		ticketError(c, http.StatusBadRequest, "ข้อความค้นหาไม่ถูกต้อง")
		return queueCriteria{}, false
	}
	if (criteria.priority != "" && !slices.Contains(ticketPriorities, criteria.priority)) ||
		(criteria.status != "" && !slices.Contains(ticketStatuses, criteria.status)) {
		ticketError(c, http.StatusBadRequest, "ตัวกรอง Priority หรือสถานะไม่ถูกต้อง")
		return queueCriteria{}, false
	}
	if !validQueueDate(criteria.from) || !validQueueDate(criteria.to) {
		ticketError(c, http.StatusBadRequest, "กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD")
		return queueCriteria{}, false
	}
	if criteria.from != "" && criteria.to != "" && criteria.from > criteria.to {
		ticketError(c, http.StatusBadRequest, "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด")
		return queueCriteria{}, false
	}
	return criteria, true
}

func validQueueDate(value string) bool {
	if value == "" {
		return true
	}
	date, err := time.Parse(time.DateOnly, value)
	return err == nil && date.Year() > 0 && date.Format(time.DateOnly) == value
}

func ticketCodeID(query string) *int64 {
	digits := strings.TrimPrefix(strings.ToUpper(query), "F1-")
	id, ok := positiveID(strings.TrimLeft(digits, "0"))
	if !ok {
		return nil
	}
	return &id
}

func ticketSummary(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		criteria, ok := readQueueCriteria(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		var all, open, mine, assigned, unassigned, triage, review, dueSoon, overdue int64
		err := db.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE status = 'open'),
			count(*) FILTER (WHERE owner_id = $1), count(*) FILTER (WHERE assignee_id = $1),
			count(*) FILTER (WHERE assignee_id IS NULL AND assignee_name = ''),
			count(*) FILTER (WHERE `+triageSQL+`), count(*) FILTER (WHERE `+reviewSQL+`), count(*) FILTER (WHERE `+dueSoonSQL+`),
			count(*) FILTER (WHERE `+overdueSQL+`) FROM tickets WHERE `+ticketCriteria,
			c.GetInt64("userID"), canManageTickets(c), criteria.query, ticketCodeID(criteria.query),
			criteria.priority, criteria.status, criteria.from, criteria.to).
			Scan(&all, &open, &mine, &assigned, &unassigned, &triage, &review, &dueSoon, &overdue)
		if err != nil {
			ticketDatabaseError(c, "load summary", err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"all": all, "open": open, "mine": mine, "assigned": assigned, "unassigned": unassigned,
			"triage": triage, "review": review, "due_soon": dueSoon, "overdue": overdue})
	}
}

func getTicket(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		rows, err := db.Query(ctx, "SELECT "+ticketColumns+" FROM tickets WHERE "+ticketVisibility+" AND id = $3",
			c.GetInt64("userID"), canManageTickets(c), id)
		if err != nil {
			ticketDatabaseError(c, "get ticket", err)
			return
		}
		result, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[ticket])
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketError(c, http.StatusNotFound, "ไม่พบ Ticket นี้ในคิว")
		case err != nil:
			ticketDatabaseError(c, "get ticket", err)
		default:
			c.JSON(http.StatusOK, result)
		}
	}
}

func paginateTickets(tickets []ticket, limit int) ([]ticket, *string) {
	if len(tickets) <= limit {
		return tickets, nil
	}
	return tickets[:limit], &tickets[limit-1].ID
}

func ticketMutationConflict(c *gin.Context, ctx context.Context, db *pgxpool.Pool, id int64, message string) {
	var exists bool
	if err := db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM tickets WHERE "+ticketVisibility+" AND id = $3)",
		c.GetInt64("userID"), canManageTickets(c), id).Scan(&exists); err != nil {
		ticketDatabaseError(c, "check ticket", err)
	} else if exists {
		ticketError(c, http.StatusConflict, message)
	} else {
		ticketError(c, http.StatusNotFound, "ไม่พบ Ticket นี้ในคิว")
	}
}

func ticketError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}

func ticketDatabaseError(c *gin.Context, operation string, err error) {
	var dbErr *pgconn.PgError
	if errors.As(err, &dbErr) && dbErr.ConstraintName == "ticket_workflow_transition" {
		ticketError(c, http.StatusConflict, "เปิดรายละเอียดเคสเพื่อส่งผลการแก้ไขหรือตรวจรับงาน")
		return
	}
	if dbErr != nil && dbErr.ConstraintName == "ticket_workflow_assignment" {
		ticketError(c, http.StatusConflict, "เปิดขั้นตอนส่งงานในรายละเอียดเคสเพื่อเปลี่ยน Dev")
		return
	}
	log.Printf("ticket %s failed (%T)", operation, err)
	ticketError(c, http.StatusServiceUnavailable, "ระบบ Ticket ยังไม่พร้อมใช้งาน กรุณาลองอีกครั้ง")
}
