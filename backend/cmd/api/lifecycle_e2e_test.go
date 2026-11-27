//go:build e2e

package main

import (
	"crypto/rand"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// The browser and API use the same migrated, disposable schema as the integration tests.
func TestTicketLifecycleE2E(t *testing.T) {
	dsn, err := url.Parse(os.Getenv("F1_TEST_DATABASE_URL"))
	if err != nil || (dsn.Scheme != "postgres" && dsn.Scheme != "postgresql") {
		t.Fatal("set F1_TEST_DATABASE_URL to a PostgreSQL test database URL")
	}
	db := integrationTestDatabase(t)
	password := rand.Text()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(t.Context(), `INSERT INTO app_users(email,password_hash,role)
        VALUES ('support@example.test',$1,'cs'), ('developer@example.test',$1,'dev')`, string(hash))
	if err != nil {
		t.Fatal(err)
	}
	query := dsn.Query()
	query.Set("search_path", db.Config().ConnConfig.RuntimeParams["search_path"])
	dsn.RawQuery = query.Encode()

	cmd := exec.CommandContext(t.Context(), "node", "node_modules/@playwright/test/cli.js", "test")
	cmd.Dir = filepath.Join("..", "..", "..", "frontend")
	cmd.Env = append(os.Environ(), "F1_E2E_DATABASE_URL="+dsn.String(), "F1_E2E_PASSWORD="+password)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("browser lifecycle: %v", err)
	}
}
