package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type adminUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

func employeePasswordError(c *gin.Context) {
	ticketError(c, http.StatusBadRequest, fmt.Sprintf("รหัสผ่านต้องมีอย่างน้อย %d ตัวอักษรและไม่เกิน 72 ไบต์", minPasswordCharacters))
}

func isTeamRole(role string) bool {
	return role == roleCS || role == roleDev
}

func listUsers(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		rows, err := db.Query(ctx, "SELECT id::text, email, role FROM app_users ORDER BY email")
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		users, err := pgx.CollectRows(rows, pgx.RowToStructByPos[adminUser])
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"users": users})
	}
}

func addUser(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Email    string `json:"email"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if !decodeTicketJSON(c, &input) {
			return
		}
		if !isTeamRole(input.Role) {
			ticketError(c, http.StatusBadRequest, "กรุณาเลือกทีม CS หรือ Dev")
			return
		}
		password := []byte(input.Password)
		defer clear(password)
		err := registerUser(c.Request.Context(), db, normalizeEmail(input.Email), password, input.Role)
		switch {
		case err == nil:
			c.Status(http.StatusCreated)
		case errors.Is(err, errInvalidEmail):
			ticketError(c, http.StatusBadRequest, "กรุณากรอกอีเมลที่ทำงานให้ถูกต้อง")
		case errors.Is(err, errInvalidPassword):
			employeePasswordError(c)
		case errors.Is(err, errDuplicateEmail):
			ticketError(c, http.StatusConflict, "อีเมลนี้มีบัญชีอยู่แล้ว")
		default:
			authDatabaseError(c, err)
		}
	}
}

func resetEmployeePassword(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			authError(c, http.StatusBadRequest)
			return
		}
		var input struct {
			Password string `json:"password"`
		}
		if !decodeJSONWithLimit(c, &input, 4096) {
			return
		}
		password := []byte(input.Password)
		defer clear(password)
		hash, err := hashUserPassword(password)
		if errors.Is(err, errInvalidPassword) {
			employeePasswordError(c)
			return
		}
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		err = pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
			result, err := tx.Exec(ctx, "UPDATE app_users SET password_hash = $2 WHERE id = $1 AND role IN ('cs', 'dev')", id, string(hash))
			if err != nil {
				return err
			}
			if result.RowsAffected() == 0 {
				return pgx.ErrNoRows
			}
			_, err = tx.Exec(ctx, `
				WITH revoked AS (DELETE FROM app_sessions WHERE user_id = $1)
				DELETE FROM dev_automation_tokens WHERE user_id = $1`, id)
			return err
		})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketError(c, http.StatusNotFound, "ไม่พบบัญชีพนักงานที่รีเซ็ตรหัสผ่านได้")
		case err != nil:
			authDatabaseError(c, err)
		default:
			c.Status(http.StatusNoContent)
		}
	}
}

func updateUserRole(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			authError(c, http.StatusBadRequest)
			return
		}
		var input struct {
			Role string `json:"role"`
		}
		if !decodeTicketJSON(c, &input) {
			return
		}
		if !isTeamRole(input.Role) {
			ticketError(c, http.StatusBadRequest, "กรุณาเลือกทีม CS หรือ Dev")
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		result, err := db.Exec(ctx, "UPDATE app_users SET role = $2 WHERE id = $1 AND role IN ('cs', 'dev')", id, input.Role)
		if err != nil {
			authDatabaseError(c, err)
			return
		}
		if result.RowsAffected() == 0 {
			ticketError(c, http.StatusNotFound, "ไม่พบบัญชีพนักงานที่เปลี่ยนทีมได้")
			return
		}
		c.Status(http.StatusNoContent)
	}
}
