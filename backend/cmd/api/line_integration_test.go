package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationTestDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("F1_TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("F1_LINE_TEST_DATABASE_URL")
	}
	if dsn == "" {
		t.Skip("set F1_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := t.Context()
	base, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := pgx.Identifier{"f1_test_" + strings.ToLower(rand.Text())}.Sanitize()
	if _, err := base.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		base.Close(ctx)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := base.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error(err)
		}
		base.Close(ctx)
	})

	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	migrations := filepath.Join("..", "..", "migrations")
	files, err := filepath.Glob(filepath.Join(migrations, "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		sql, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("migration %s: %v", file, err)
		}
	}
	return db
}

func TestLineAssignmentDelivery(t *testing.T) {
	db := integrationTestDatabase(t)
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec("INSERT INTO app_users (email, password_hash) VALUES ('dev@example.com', 'unused'), ('other@example.com', 'unused')")
	line := &lineService{db: db, secret: "test-secret", accessToken: "test-token", accountID: "@f1-test"}
	const lineUser = "U0123456789abcdef0123456789abcdef"
	const otherLineUser = "U1123456789abcdef0123456789abcdef"

	router := gin.New()
	router.POST("/webhook", line.webhook)
	router.POST("/pair", func(c *gin.Context) { c.Set("userID", int64(1)); line.createPairing(c) })
	router.DELETE("/connection", func(c *gin.Context) { c.Set("userID", int64(1)); line.disconnect(c) })
	call := func(method, path string, payload []byte, signature string, want int) []byte {
		t.Helper()
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(method, path, bytes.NewReader(payload))
		request.Header.Set("X-Line-Signature", signature)
		router.ServeHTTP(recorder, request)
		if recorder.Code != want {
			t.Fatalf("%s %s: got %d, want %d", method, path, recorder.Code, want)
		}
		return recorder.Body.Bytes()
	}
	pair := func() string {
		t.Helper()
		var response struct{ Command string }
		body := call(http.MethodPost, "/pair", nil, "", http.StatusCreated)
		if err := json.Unmarshal(body, &response); err != nil || response.Command == "" {
			t.Fatal("pairing command missing")
		}
		return response.Command
	}
	webhook := func(command, user, source string, signed bool, want int) {
		t.Helper()
		var event lineWebhookEvent
		event.Type = "message"
		event.Source.Type, event.Source.UserID = source, user
		event.Message.Type, event.Message.Text = "text", command
		body, err := json.Marshal(map[string]any{"events": []lineWebhookEvent{event}})
		if err != nil {
			t.Fatal(err)
		}
		signature := ""
		if signed {
			mac := hmac.New(sha256.New, []byte(line.secret))
			mac.Write(body)
			signature = base64.StdEncoding.EncodeToString(mac.Sum(nil))
		}
		call(http.MethodPost, "/webhook", body, signature, want)
	}

	expired := pair()
	exec("UPDATE staff_line SET pairing_expires_at = now() - interval '1 minute'")
	webhook(expired, otherLineUser, "user", true, http.StatusOK)
	command := pair()
	webhook(command, otherLineUser, "user", false, http.StatusUnauthorized)
	webhook(command, otherLineUser, "group", true, http.StatusOK)
	webhook(command, lineUser, "user", true, http.StatusOK)
	webhook(command, otherLineUser, "user", true, http.StatusOK)
	call(http.MethodPost, "/pair", nil, "", http.StatusConflict)

	exec(`INSERT INTO tickets(request_id,title,description,source,assignee_id)
		VALUES (gen_random_uuid(),'Private title','Private details','internal',1)`)
	exec("UPDATE tickets SET assignee_id = 1 WHERE id = 1")
	var retryKey string
	var requests sync.Mutex
	calls := 0
	requestCount := func() int {
		requests.Lock()
		defer requests.Unlock()
		return calls
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			To       string
			Messages []struct{ Type, Text string }
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
			body.To != lineUser || len(body.Messages) != 1 ||
			body.Messages[0].Type != "text" || !strings.Contains(body.Messages[0].Text, "F1-000001") ||
			strings.Contains(body.Messages[0].Text, "Private") {
			t.Error("provider received incorrect recipient or message")
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("provider did not receive channel authorization")
		}
		requests.Lock()
		defer requests.Unlock()
		calls++
		if calls == 1 {
			retryKey = r.Header.Get("X-Line-Retry-Key")
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if retryKey == "" || retryKey != r.Header.Get("X-Line-Retry-Key") {
			t.Error("retry changed the LINE retry key")
		}
		w.Header().Set("X-Line-Accepted-Request-Id", "test-request")
		w.WriteHeader(http.StatusConflict)
	}))
	defer provider.Close()
	line.client, line.pushURL = provider.Client(), provider.URL
	deliver := func() {
		t.Helper()
		if err := line.deliverNext(ctx); err != nil {
			t.Fatal(err)
		}
	}
	deliver()
	deliver()
	exec("UPDATE line_assignment_outbox SET next_attempt_at = now()")
	deliver()
	deliver()
	var accepted bool
	var attempts int
	if err := db.QueryRow(ctx, "SELECT accepted, attempts FROM line_assignment_outbox").Scan(&accepted, &attempts); err != nil {
		t.Fatal(err)
	}
	if !accepted || attempts != 2 || requestCount() != 2 {
		t.Fatalf("expected one accepted assignment after two requests, got accepted=%v attempts=%d calls=%d", accepted, attempts, requestCount())
	}

	exec("UPDATE tickets SET assignee_id = 2 WHERE id = 1")
	exec("UPDATE tickets SET assignee_id = 1 WHERE id = 1")
	call(http.MethodDelete, "/connection", nil, "", http.StatusNoContent)
	deliver()
	if requestCount() != 2 {
		t.Fatal("unlinked recipient received a pending notification")
	}
}
