package main

import (
	"context"
	"encoding/csv"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var exportStatuses = map[string]string{
	"open": "เปิดใหม่", "in_progress": "กำลังดำเนินการ", "resolved": "แก้ไขแล้ว", "closed": "ปิดแล้ว",
}
var exportPriorities = map[string]string{"urgent": "Critical", "high": "High", "normal": "Med", "low": "Low"}
var exportCategories = map[string]string{
	"sd": "SD", "bug": "Bug", "adjustment": "Adjustment", "question": "Question", "data": "Data", "customize": "Customize",
}

func exportTickets(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		filter, ok := queueFilter(c)
		if !ok {
			return
		}
		criteria, ok := readQueueCriteria(c)
		if !ok {
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
		defer cancel()
		rows, err := db.Query(ctx, `
			WITH matches AS (SELECT * FROM tickets WHERE `+ticketFilter+`)
			SELECT to_char(t.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
			       t.code, t.customer_name, t.title, t.description, t.status,
			       split_part(coalesce(owner.email, ''), '@', 1),
			       coalesce(nullif(t.assignee_name, ''), split_part(coalesce(assignee.email, ''), '@', 1)),
			       t.priority, t.category, t.product, t.notes,
			       coalesce(to_char(t.completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'), ''),
			       CASE WHEN t.status IN ('resolved', 'closed') THEN ''
			            ELSE greatest(0, (now() AT TIME ZONE 'Asia/Bangkok')::date -
			                          (t.created_at AT TIME ZONE 'Asia/Bangkok')::date)::text END,
			       (SELECT count(*) FROM ticket_images i WHERE i.ticket_id = t.id)
			FROM matches t
			LEFT JOIN app_users owner ON owner.id = t.owner_id
			LEFT JOIN app_users assignee ON assignee.id = t.assignee_id
			ORDER BY t.id DESC`, c.GetInt64("userID"), canManageTickets(c), criteria.query, ticketCodeID(criteria.query),
			criteria.priority, criteria.status, criteria.from, criteria.to, filter)
		if err != nil {
			ticketDatabaseError(c, "export", err)
			return
		}
		defer rows.Close()

		// Finish the file before sending headers so a failed query cannot return a partial CSV.
		file, err := os.CreateTemp("", "f1-tickets-*.csv")
		if err != nil {
			ticketDatabaseError(c, "create export file", err)
			return
		}
		defer os.Remove(file.Name())
		defer file.Close()
		if err := writeTicketCSV(file, rows); err != nil {
			ticketDatabaseError(c, "write export file", err)
			return
		}
		size, err := file.Seek(0, io.SeekCurrent)
		if err == nil {
			_, err = file.Seek(0, io.SeekStart)
		}
		if err != nil {
			ticketDatabaseError(c, "read export file", err)
			return
		}
		filename := "f1-tickets-" + time.Now().In(time.FixedZone("ICT", 7*60*60)).Format("20060102") + ".csv"
		c.Header("Cache-Control", "private, no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
		c.DataFromReader(http.StatusOK, size, "text/csv; charset=utf-8", file, nil)
	}
}

func writeTicketCSV(file *os.File, rows pgx.Rows) error {
	// A UTF-8 BOM lets spreadsheet apps recognize the Thai column names and text.
	if _, err := file.WriteString("\ufeff"); err != nil {
		return err
	}
	writer := csv.NewWriter(file)
	writer.UseCRLF = true
	if err := writer.Write([]string{
		"วันที่รับแจ้ง", "Job ID", "ชื่อลูกค้า", "รายละเอียด", "สถานะ", "ผู้แจ้ง", "ผู้รับผิดชอบ",
		"ความเร่งด่วน", "ประเภท", "สินค้า", "วันที่เสร็จ", "อายุงาน (วัน)", "หมายเหตุ", "จำนวนรูปแนบ", "ผู้ได้รับมอบหมาย",
	}); err != nil {
		return err
	}
	for rows.Next() {
		var created, code, customer, title, description, status, owner, assignee, priority, category, product, notes, age string
		var completed string
		var images int64
		if err := rows.Scan(&created, &code, &customer, &title, &description, &status, &owner, &assignee,
			&priority, &category, &product, &notes, &completed, &age, &images); err != nil {
			return err
		}
		if err := writer.Write([]string{
			created, code, safeCSVText(customer), safeCSVText(title + "\n" + description), exportStatuses[status],
			safeCSVText(owner), safeCSVText(owner), exportPriorities[priority], exportCategories[category], productLabels[product],
			completed, age, safeCSVText(notes), strconv.FormatInt(images, 10), safeCSVText(assignee),
		}); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	writer.Flush()
	return writer.Error()
}

func safeCSVText(value string) string {
	trimmed := strings.TrimLeftFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r) || r == '\ufeff'
	})
	first, _ := utf8.DecodeRuneInString(trimmed)
	if strings.HasPrefix(value, "\t") || strings.HasPrefix(value, "\r") || strings.HasPrefix(value, "\n") ||
		strings.ContainsRune("=+-@＝＋－＠", first) {
		return "'" + value
	}
	return value
}
