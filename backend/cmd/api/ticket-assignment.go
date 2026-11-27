package main

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type staffMember struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

func listStaff(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		rows, err := db.Query(ctx, "SELECT id::text, email, role FROM app_users ORDER BY email")
		if err != nil {
			ticketDatabaseError(c, "list staff", err)
			return
		}
		staff, err := pgx.CollectRows(rows, pgx.RowToStructByPos[staffMember])
		if err != nil {
			ticketDatabaseError(c, "list staff", err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"staff": staff})
	}
}

func updateTicketAssignment(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
			return
		}
		var input struct {
			OwnerID        string  `json:"ownerId"`
			AssigneeID     string  `json:"assigneeId"`
			AssigneeName   *string `json:"assigneeName"`
			Version        *int32  `json:"assignmentVersion"`
			Status         *string `json:"status"`
			ExpectedStatus *string `json:"expectedStatus"`
		}
		if !decodeTicketJSON(c, &input) {
			return
		}
		if input.Version == nil || *input.Version < 0 {
			ticketError(c, http.StatusBadRequest, "กรุณาระบุเวอร์ชันการมอบหมาย")
			return
		}
		if (input.Status == nil) != (input.ExpectedStatus == nil) ||
			(input.Status != nil && (!slices.Contains(ticketStatuses, *input.Status) || !slices.Contains(ticketStatuses, *input.ExpectedStatus))) {
			ticketError(c, http.StatusBadRequest, "กรุณาเลือกสถานะที่ถูกต้อง")
			return
		}
		if input.OwnerID == "" && input.Status == nil {
			ticketError(c, http.StatusBadRequest, "กรุณาเลือกผู้รับผิดชอบเคส")
			return
		}
		ownerID, ownerOK := optionalStaffID(input.OwnerID)
		assigneeID, assigneeOK := optionalStaffID(input.AssigneeID)
		if !ownerOK || !assigneeOK {
			ticketError(c, http.StatusBadRequest, "รายชื่อผู้รับผิดชอบหรือผู้ได้รับมอบหมายไม่ถูกต้อง")
			return
		}
		if input.AssigneeName != nil {
			name := strings.TrimSpace(*input.AssigneeName)
			if !validAssigneeName(c, input.AssigneeID, name) {
				return
			}
			input.AssigneeName = &name
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		// An omitted name from an older caller preserves the typed name unless a linked account is selected.
		const nextName = `COALESCE($7::text, CASE WHEN $3::bigint IS NULL THEN assignee_name ELSE '' END)`
		const sameAssignment = `owner_id IS NOT DISTINCT FROM $2 AND assignee_id IS NOT DISTINCT FROM $3 AND assignee_name = ` + nextName
		result, err := writeTicketRow(ctx, db, c.GetInt64("userID"), `
			UPDATE tickets
			SET owner_id = $2, assignee_id = $3,
			    assignee_name = `+nextName+`,
			    status = COALESCE($5::text, status),
			    assignment_version = CASE WHEN `+sameAssignment+`
			                              THEN assignment_version ELSE assignment_version + 1 END
			WHERE id = $1 AND ($2::bigint IS NOT NULL OR owner_id IS NULL) AND (
			      (assignment_version = $4 AND ($5::text IS NULL OR status = $6::text)) OR
			      (`+sameAssignment+` AND ($5::text IS NULL OR status = $5)))
			RETURNING `+ticketColumns, id, ownerID, assigneeID, *input.Version, input.Status, input.ExpectedStatus, input.AssigneeName)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketMutationConflict(c, ctx, db, id, "มีผู้ใช้อื่นแก้ไขเคสนี้ก่อนคุณบันทึก กรุณาตรวจสอบข้อมูลล่าสุด")
		case err != nil:
			assignmentDatabaseError(c, "assign", err)
		default:
			c.JSON(http.StatusOK, result)
		}
	}
}

func validAssigneeName(c *gin.Context, accountID, name string) bool {
	if name == "" {
		return true
	}
	if accountID != "" || !validTicketText(name, 120) {
		ticketError(c, http.StatusBadRequest, "พิมพ์ชื่อผู้ได้รับมอบหมายได้ไม่เกิน 120 ตัวอักษร หรือเลือกบัญชี F1 อย่างใดอย่างหนึ่ง")
		return false
	}
	return true
}

func optionalStaffID(value string) (*int64, bool) {
	if value == "" {
		return nil, true
	}
	id, ok := positiveID(value)
	return &id, ok
}

func positiveID(value string) (int64, bool) {
	id, err := strconv.ParseInt(value, 10, 64)
	return id, err == nil && id > 0 && value == strconv.FormatInt(id, 10)
}

func staffSelection(c *gin.Context, owner, assignee string) (int64, *int64, bool) {
	ownerID, ok := positiveID(owner)
	if !ok {
		ticketError(c, http.StatusBadRequest, "กรุณาเลือกผู้รับผิดชอบเคส")
		return 0, nil, false
	}
	if assignee == "" {
		return ownerID, nil, true
	}
	assigneeID, ok := positiveID(assignee)
	if !ok {
		ticketError(c, http.StatusBadRequest, "ผู้ได้รับมอบหมายไม่ถูกต้อง")
		return 0, nil, false
	}
	return ownerID, &assigneeID, true
}

func assignmentDatabaseError(c *gin.Context, operation string, err error) {
	var dbErr *pgconn.PgError
	if errors.As(err, &dbErr) && dbErr.Code == "23503" {
		ticketError(c, http.StatusBadRequest, "ไม่พบบัญชีพนักงานที่เลือก กรุณาเลือกรายชื่ออีกครั้ง")
		return
	}
	ticketDatabaseError(c, operation, err)
}
