package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const linePairingMinutes = 10

var lineUserIDPattern = regexp.MustCompile(`^U[0-9a-f]{32}$`)
var lineAccountIDPattern = regexp.MustCompile(`^@[A-Za-z0-9_.-]+$`)

type lineService struct {
	db          *pgxpool.Pool
	client      *http.Client
	secret      string
	accessToken string
	accountID   string
	publicURL   *url.URL
	pushURL     string
}

func newLineService(db *pgxpool.Pool) *lineService {
	line := &lineService{
		db: db,
		client: &http.Client{
			Timeout: 8 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		secret:      strings.TrimSpace(os.Getenv("LINE_CHANNEL_SECRET")),
		accessToken: strings.TrimSpace(os.Getenv("LINE_CHANNEL_ACCESS_TOKEN")),
		accountID:   strings.TrimSpace(os.Getenv("LINE_OFFICIAL_ACCOUNT_ID")),
		pushURL:     "https://api.line.me/v2/bot/message/push",
	}
	if value, err := url.Parse(strings.TrimSpace(os.Getenv("F1_PUBLIC_URL"))); err == nil &&
		value.Scheme == "https" && value.Host != "" && value.User == nil &&
		value.RawQuery == "" && value.Fragment == "" && (value.Path == "" || value.Path == "/") {
		line.publicURL = value
	}
	return line
}

func (line *lineService) enabled() bool {
	return line.secret != "" && line.accessToken != "" && lineAccountIDPattern.MatchString(line.accountID)
}

func (line *lineService) status(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	var linked bool
	if err := line.db.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM staff_line WHERE user_id = $1 AND line_user_id IS NOT NULL)`,
		c.GetInt64("userID")).Scan(&linked); err != nil {
		authDatabaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": line.enabled(), "linked": linked, "accountId": line.accountID})
}

func (line *lineService) createPairing(c *gin.Context) {
	if !line.enabled() {
		authError(c, http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	var secret [16]byte
	rand.Read(secret[:])
	token := base64.RawURLEncoding.EncodeToString(secret[:])
	hash := sha256.Sum256([]byte(token))
	result, err := line.db.Exec(ctx, `
		INSERT INTO staff_line (user_id, pairing_hash, pairing_expires_at)
		VALUES ($1, $2, now() + $3::int * interval '1 minute')
		ON CONFLICT (user_id) DO UPDATE SET
		    pairing_hash = EXCLUDED.pairing_hash, pairing_expires_at = EXCLUDED.pairing_expires_at
		WHERE staff_line.line_user_id IS NULL`, c.GetInt64("userID"), hash[:], linePairingMinutes)
	if err != nil {
		authDatabaseError(c, err)
		return
	}
	if result.RowsAffected() == 0 {
		authError(c, http.StatusConflict)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"command": "F1 " + token, "minutes": linePairingMinutes})
}

func (line *lineService) disconnect(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	if _, err := line.db.Exec(ctx, "DELETE FROM staff_line WHERE user_id = $1", c.GetInt64("userID")); err != nil {
		authDatabaseError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

type lineWebhookEvent struct {
	Type      string `json:"type"`
	Timestamp int64  `json:"timestamp"`
	Source    struct {
		Type   string `json:"type"`
		UserID string `json:"userId"`
	} `json:"source"`
	Message struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"message"`
}

func (line *lineService) webhook(c *gin.Context) {
	if !line.enabled() {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	mac := hmac.New(sha256.New, []byte(line.secret))
	mac.Write(body)
	signature, err := base64.StdEncoding.DecodeString(c.GetHeader("X-Line-Signature"))
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		c.Status(http.StatusUnauthorized)
		return
	}
	var payload struct {
		Events []lineWebhookEvent `json:"events"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	for _, event := range payload.Events {
		if err := line.handleEvent(ctx, event); err != nil {
			authDatabaseError(c, err)
			return
		}
	}
	c.Status(http.StatusOK)
}

func (line *lineService) handleEvent(ctx context.Context, event lineWebhookEvent) error {
	userID := event.Source.UserID
	if event.Source.Type != "user" || !lineUserIDPattern.MatchString(userID) {
		return nil
	}
	if event.Type == "unfollow" {
		_, err := line.db.Exec(ctx, "DELETE FROM staff_line WHERE line_user_id = $1 AND linked_at <= $2",
			userID, time.UnixMilli(event.Timestamp))
		return err
	}
	if event.Type != "message" || event.Message.Type != "text" {
		return nil
	}
	parts := strings.Fields(event.Message.Text)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "F1") || len(parts[1]) != base64.RawURLEncoding.EncodedLen(16) {
		return nil
	}
	if _, err := base64.RawURLEncoding.Strict().DecodeString(parts[1]); err != nil {
		return nil
	}
	hash := sha256.Sum256([]byte(parts[1]))
	_, err := line.db.Exec(ctx, `
		UPDATE staff_line SET line_user_id = $1, linked_at = clock_timestamp(),
		    pairing_hash = NULL, pairing_expires_at = NULL
		WHERE pairing_hash = $2 AND pairing_expires_at > now() AND line_user_id IS NULL`, userID, hash[:])
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		// One LINE account cannot receive notifications for two staff accounts.
		return nil
	}
	return err
}
