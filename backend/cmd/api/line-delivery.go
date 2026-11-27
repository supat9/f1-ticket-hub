package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const maxLineAttempts = 5

type lineJob struct {
	notificationID int64
	recipient      string
	retryKey       string
	code           string
	attempt        int
}

func (line *lineService) runDelivery(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := line.deliverNext(ctx); err != nil && ctx.Err() == nil {
				log.Printf("LINE delivery queue operation failed (%T)", err)
			}
		}
	}
}

func (line *lineService) deliverNext(ctx context.Context) error {
	claimContext, cancel := context.WithTimeout(ctx, 3*time.Second)
	var job lineJob
	err := line.db.QueryRow(claimContext, `
		WITH due AS (
		    SELECT o.notification_id, t.code
		    FROM line_assignment_outbox o
		    JOIN assignment_notifications n ON n.id = o.notification_id
		    JOIN tickets t ON t.id = n.ticket_id
		    WHERE o.finished_at IS NULL AND o.next_attempt_at <= now()
		      AND o.attempts < $1 AND n.created_at > now() - interval '12 hours'
		    ORDER BY o.next_attempt_at, o.notification_id
		    LIMIT 1 FOR UPDATE OF o SKIP LOCKED
		)
		UPDATE line_assignment_outbox o
		SET attempts = o.attempts + 1, next_attempt_at = now() + interval '30 seconds'
		FROM due WHERE o.notification_id = due.notification_id
		RETURNING o.notification_id, o.line_user_id, o.retry_key::text, due.code, o.attempts`, maxLineAttempts).
		Scan(&job.notificationID, &job.recipient, &job.retryKey, &job.code, &job.attempt)
	cancel()
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	accepted, retry := line.pushAssignment(ctx, job)
	finished := !retry || job.attempt >= maxLineAttempts
	recordContext, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if finished {
		if !accepted && ctx.Err() == nil {
			log.Printf("LINE did not accept assignment notification %d", job.notificationID)
		}
		_, err = line.db.Exec(recordContext, `
			UPDATE line_assignment_outbox SET finished_at = now(), accepted = $3
			WHERE notification_id = $1 AND attempts = $2`, job.notificationID, job.attempt, accepted)
	} else {
		delay := 30 * (1 << (job.attempt - 1))
		_, err = line.db.Exec(recordContext, `
			UPDATE line_assignment_outbox SET next_attempt_at = now() + $3::int * interval '1 second'
			WHERE notification_id = $1 AND attempts = $2`, job.notificationID, job.attempt, delay)
	}
	return err
}

func (line *lineService) pushAssignment(ctx context.Context, job lineJob) (accepted, retry bool) {
	message := "F1 Ticket Hub: คุณได้รับมอบหมายเคส " + job.code
	if line.publicURL != nil {
		link := *line.publicURL
		link.Path = "/"
		query := link.Query()
		query.Set("q", job.code)
		link.RawQuery = query.Encode()
		message += "\nเปิดคิวเคส: " + link.String()
	}
	body, err := json.Marshal(struct {
		To       string              `json:"to"`
		Messages []map[string]string `json:"messages"`
	}{job.recipient, []map[string]string{{"type": "text", "text": message}}})
	if err != nil {
		return false, false
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, line.pushURL, bytes.NewReader(body))
	if err != nil {
		return false, false
	}
	request.Header.Set("Authorization", "Bearer "+line.accessToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Line-Retry-Key", job.retryKey)
	response, err := line.client.Do(request)
	if err != nil {
		return false, true
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
		return true, false
	case http.StatusConflict:
		// LINE returns this when a request with this retry key was already accepted.
		return response.Header.Get("X-Line-Accepted-Request-Id") != "", false
	default:
		return false, response.StatusCode >= 500
	}
}
