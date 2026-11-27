package main

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var productLabels = map[string]string{"customer_portal": "Customer Portal", "checkout": "Checkout"}

// Preserve the wire aliases and request fingerprints used before the product rename.
var legacyProductKeys = map[string]string{"customer_portal": "dr_ease", "checkout": "ease_pos"}

type ticketDetailsFields struct {
	CustomerName string `json:"customerName"`
	Product      string `json:"product"`
	Category     string `json:"category"`
	Notes        string `json:"notes"`
}

func (fields *ticketDetailsFields) validate() string {
	fields.CustomerName = strings.TrimSpace(fields.CustomerName)
	fields.Notes = strings.TrimSpace(fields.Notes)
	for product, legacy := range legacyProductKeys {
		if fields.Product == legacy {
			fields.Product = product
			break
		}
	}
	switch {
	case strings.ContainsRune(fields.CustomerName, 0) || utf8.RuneCountInString(fields.CustomerName) > 160:
		return "ชื่อลูกค้าต้องไม่เกิน 160 ตัวอักษร"
	case strings.ContainsRune(fields.Notes, 0) || utf8.RuneCountInString(fields.Notes) > 5000:
		return "หมายเหตุต้องไม่เกิน 5,000 ตัวอักษร"
	case fields.Product != "" && productLabels[fields.Product] == "":
		return "กรุณาเลือกสินค้าที่ถูกต้อง"
	case !slices.Contains([]string{"", "sd", "bug", "adjustment", "question", "data", "customize"}, fields.Category):
		return "กรุณาเลือกประเภทเคสที่ถูกต้อง"
	}
	return ""
}

func updateTicketDetails(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
			return
		}
		var input struct {
			ticketDetailsFields
			Version *int32 `json:"detailsVersion"`
		}
		if !decodeTicketJSON(c, &input) {
			return
		}
		if input.Version == nil || *input.Version < 0 {
			ticketError(c, http.StatusBadRequest, "กรุณาโหลดรายละเอียดเคสใหม่")
			return
		}
		if message := input.validate(); message != "" {
			ticketError(c, http.StatusBadRequest, message)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		_, err := ticketWrite(ctx, db, c.GetInt64("userID"), func(tx pgx.Tx) (int32, error) {
			var version int32
			err := tx.QueryRow(ctx, `
			UPDATE tickets SET customer_name = $2, product = $3, category = $4, notes = $5,
			    details_version = CASE WHEN (customer_name, product, category, notes) = ($2, $3, $4, $5)
			                           THEN details_version ELSE details_version + 1 END
			WHERE id = $1 AND (details_version = $6 OR (customer_name, product, category, notes) = ($2, $3, $4, $5))
			RETURNING details_version`, id, input.CustomerName, input.Product, input.Category, input.Notes, *input.Version).
				Scan(&version)
			return version, err
		})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketMutationConflict(c, ctx, db, id, "รายละเอียดเคสถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุด")
		case err != nil:
			ticketDatabaseError(c, "update details", err)
		default:
			c.Status(http.StatusNoContent)
		}
	}
}
