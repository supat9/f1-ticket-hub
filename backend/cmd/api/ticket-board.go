package main

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ticketStatuses = []string{"open", "in_progress", "resolved", "closed"}

const boardPageSize = 15

type boardColumn struct {
	Status     string   `json:"status"`
	Total      int64    `json:"total"`
	Tickets    []ticket `json:"tickets"`
	NextCursor *string  `json:"nextCursor"`
}

func ticketBoard(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		filter, ok := queueFilter(c)
		if !ok {
			return
		}
		criteria, ok := readQueueCriteria(c)
		if !ok {
			return
		}
		cursors := make([]int64, len(ticketStatuses))
		for i, status := range ticketStatuses {
			if raw, exists := c.GetQuery(status); exists {
				cursor, ok := positiveID(raw)
				if !ok {
					ticketError(c, http.StatusBadRequest, "เลขหน้าของคอลัมน์ Kanban ไม่ถูกต้อง")
					return
				}
				cursors[i] = cursor
			}
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		// Counts and cards share the same snapshot so a move appears in exactly one column.
		rows, err := db.Query(ctx, `
			WITH filtered AS NOT MATERIALIZED (SELECT * FROM tickets WHERE `+ticketFilter+`),
			     totals AS (SELECT status, count(*) AS total FROM filtered GROUP BY status)
			SELECT stage.status, COALESCE(totals.total, 0), COALESCE(items.cards, '[]'::jsonb)
			FROM unnest($10::text[], $11::bigint[]) WITH ORDINALITY AS stage(status, cursor, position)
			LEFT JOIN totals ON totals.status = stage.status
			CROSS JOIN LATERAL (
			    SELECT jsonb_agg(to_jsonb(card) ORDER BY card.id::bigint DESC) AS cards
			    FROM (
			        SELECT `+ticketColumns+` FROM filtered
			        WHERE status = stage.status AND (stage.cursor = 0 OR id < stage.cursor)
			        ORDER BY filtered.id DESC LIMIT $12
			    ) AS card
			) AS items
			ORDER BY stage.position`, c.GetInt64("userID"), canManageTickets(c), criteria.query, ticketCodeID(criteria.query),
			criteria.priority, criteria.status, criteria.from, criteria.to, filter, ticketStatuses, cursors, boardPageSize+1)
		if err != nil {
			ticketDatabaseError(c, "load board", err)
			return
		}

		columns, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (boardColumn, error) {
			var column boardColumn
			err := row.Scan(&column.Status, &column.Total, &column.Tickets)
			column.Tickets, column.NextCursor = paginateTickets(column.Tickets, boardPageSize)
			return column, err
		})
		if err != nil {
			ticketDatabaseError(c, "load board", err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"columns": columns})
	}
}

func updateTicketStatus(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
			return
		}
		var input struct {
			Status         string `json:"status"`
			ExpectedStatus string `json:"expectedStatus"`
		}
		if !decodeTicketJSON(c, &input) {
			return
		}
		if !slices.Contains(ticketStatuses, input.Status) || !slices.Contains(ticketStatuses, input.ExpectedStatus) {
			ticketError(c, http.StatusBadRequest, "กรุณาเลือกสถานะที่ถูกต้อง")
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		status, err := ticketWrite(ctx, db, c.GetInt64("userID"), func(tx pgx.Tx) (string, error) {
			var status string
			err := tx.QueryRow(ctx, `
			UPDATE tickets SET status = $4
			WHERE `+ticketVisibility+` AND id = $3 AND status IN ($4, $5) RETURNING status`,
				c.GetInt64("userID"), canManageTickets(c), id, input.Status, input.ExpectedStatus).Scan(&status)
			return status, err
		})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketMutationConflict(c, ctx, db, id, "สถานะเคสถูกเปลี่ยนแล้ว กรุณาตรวจสอบสถานะล่าสุด")
		case err != nil:
			ticketDatabaseError(c, "update status", err)
		default:
			c.JSON(http.StatusOK, gin.H{"status": status})
		}
	}
}
