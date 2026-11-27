package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/time/rate"
)

const passwordCost = 12
const sessionLifetime = 8 * time.Hour
const (
	roleAdmin = "admin"
	roleCS    = "cs"
	roleDev   = "dev"
)

type authService struct {
	db        *pgxpool.Pool
	dummyHash []byte
	limiter   *rate.Limiter
}

func newAuth(db *pgxpool.Pool) (*authService, error) {
	dummyHash, err := bcrypt.GenerateFromPassword([]byte("F1 invalid account timing hash"), passwordCost)
	if err != nil {
		return nil, err
	}
	return &authService{
		db:        db,
		dummyHash: dummyHash,
		limiter:   rate.NewLimiter(rate.Every(time.Second), 6),
	}, nil
}

func (auth *authService) login(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if c.ContentType() != "application/json" {
		authError(c, http.StatusUnsupportedMediaType)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if err := c.ShouldBindJSON(&input); err != nil {
		authError(c, http.StatusBadRequest)
		return
	}
	email := normalizeEmail(input.Email)
	if email == "" || len(email) > 254 || input.Password == "" || len(input.Password) > 72 {
		authError(c, http.StatusUnauthorized)
		return
	}
	if !auth.limiter.Allow() {
		c.Header("Retry-After", "1")
		authError(c, http.StatusTooManyRequests)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 4*time.Second)
	defer cancel()
	var id int64
	var passwordHash string
	err := auth.db.QueryRow(ctx, "SELECT id, password_hash FROM app_users WHERE email = $1", email).
		Scan(&id, &passwordHash)
	hash := []byte(passwordHash)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		hash = auth.dummyHash
	case err != nil:
		authDatabaseError(c, err)
		return
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(input.Password)) != nil || id == 0 {
		authError(c, http.StatusUnauthorized)
		return
	}

	var secret [32]byte
	rand.Read(secret[:])
	token := base64.RawURLEncoding.EncodeToString(secret[:])
	tokenHash := sha256.Sum256([]byte(token))
	expires := time.Now().UTC().Add(sessionLifetime)
	result, err := auth.db.Exec(ctx, `
		WITH verified AS (SELECT id FROM app_users WHERE id = $2 AND password_hash = $4 FOR SHARE),
		     expired AS (DELETE FROM app_sessions WHERE expires_at <= now() AND EXISTS (SELECT 1 FROM verified))
		INSERT INTO app_sessions (token_hash, user_id, expires_at) SELECT $1, id, $3 FROM verified`,
		tokenHash[:], id, expires, passwordHash)
	if err != nil {
		authDatabaseError(c, err)
		return
	}
	if result.RowsAffected() == 0 {
		authError(c, http.StatusUnauthorized)
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "expiresAt": expires})
}

func (auth *authService) requireSession(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	tokenHash, valid := bearerHash(c)
	if !valid {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	var userID int64
	var email, role string
	err := auth.db.QueryRow(ctx, `
		SELECT app_users.id, app_users.email, app_users.role FROM app_sessions JOIN app_users ON app_users.id = app_sessions.user_id
		WHERE app_sessions.token_hash = $1 AND app_sessions.expires_at > now()`, tokenHash[:]).Scan(&userID, &email, &role)
	if err != nil {
		c.Abort()
		if errors.Is(err, pgx.ErrNoRows) {
			authError(c, http.StatusUnauthorized)
		} else {
			authDatabaseError(c, err)
		}
		return
	}
	c.Set("userID", userID)
	c.Set("userEmail", email)
	c.Set("userRole", role)
	c.Next()
}

func requireRoles(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !slices.Contains(roles, c.GetString("userRole")) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "บัญชีนี้ไม่มีสิทธิ์ทำรายการ"})
			return
		}
		c.Next()
	}
}

func canManageTickets(c *gin.Context) bool {
	role := c.GetString("userRole")
	return role == roleAdmin || role == roleCS
}

func (auth *authService) session(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"id": strconv.FormatInt(c.GetInt64("userID"), 10), "email": c.GetString("userEmail"), "role": c.GetString("userRole")})
}

func (auth *authService) logout(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	tokenHash, valid := bearerHash(c)
	if valid {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		if _, err := auth.db.Exec(ctx, "DELETE FROM app_sessions WHERE token_hash = $1", tokenHash[:]); err != nil {
			authDatabaseError(c, err)
			return
		}
	}
	c.Status(http.StatusNoContent)
}

func bearerHash(c *gin.Context) ([sha256.Size]byte, bool) {
	scheme, token, ok := strings.Cut(c.GetHeader("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || len(token) != base64.RawURLEncoding.EncodedLen(32) {
		return [sha256.Size]byte{}, false
	}
	if _, err := base64.RawURLEncoding.Strict().DecodeString(token); err != nil {
		return [sha256.Size]byte{}, false
	}
	return sha256.Sum256([]byte(token)), true
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func authError(c *gin.Context, status int) {
	c.JSON(status, gin.H{"error": http.StatusText(status)})
}

func authDatabaseError(c *gin.Context, err error) {
	log.Printf("auth database operation failed (%T)", err)
	authError(c, http.StatusServiceUnavailable)
}
