package main

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ticketReportResult struct {
	Total                 int64    `json:"total"`
	Backlog               int64    `json:"backlog"`
	Overdue               int64    `json:"overdue"`
	DueSoon               int64    `json:"dueSoon"`
	Resolved              int64    `json:"resolved"`
	ResolvedInTime        int64    `json:"resolvedInTime"`
	Started               int64    `json:"started"`
	MedianStartHours      *float64 `json:"medianStartHours"`
	MedianResolutionHours *float64 `json:"medianResolutionHours"`
}

func ticketReport(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		criteria, ok := readQueueCriteria(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		var result ticketReportResult
		err := db.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE status IN ('open', 'in_progress')),
			count(*) FILTER (WHERE `+overdueSQL+`), count(*) FILTER (WHERE `+dueSoonSQL+`),
			count(completed_at), count(*) FILTER (WHERE completed_at <= `+dueAtSQL+`), count(first_started_at),
			percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_started_at - created_at) / 3600.0),
			percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - created_at) / 3600.0)
			FROM tickets WHERE `+ticketCriteria, c.GetInt64("userID"), canManageTickets(c), criteria.query, ticketCodeID(criteria.query),
			criteria.priority, criteria.status, criteria.from, criteria.to).
			Scan(&result.Total, &result.Backlog, &result.Overdue, &result.DueSoon, &result.Resolved, &result.ResolvedInTime,
				&result.Started, &result.MedianStartHours, &result.MedianResolutionHours)
		if err != nil {
			ticketDatabaseError(c, "load report", err)
			return
		}
		c.JSON(http.StatusOK, result)
	}
}
