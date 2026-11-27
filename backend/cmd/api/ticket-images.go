package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxTicketImageSize = 5 << 20
const ticketImageJSONLimit = 7 << 20
const maxTicketImages = 5

type ticketImage struct {
	content     []byte
	contentType string
	digest      []byte
}

func parseTicketImage(encoded string) (ticketImage, string) {
	if encoded == "" {
		return ticketImage{}, ""
	}
	if len(encoded) > base64.StdEncoding.EncodedLen(maxTicketImageSize) {
		return ticketImage{}, "รูปภาพต้องมีขนาดไม่เกิน 5 MB"
	}
	content, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if len(content) > maxTicketImageSize {
		return ticketImage{}, "รูปภาพต้องมีขนาดไม่เกิน 5 MB"
	}
	if err != nil {
		return ticketImage{}, "อ่านไฟล์รูปภาพไม่ได้"
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil || (format != "jpeg" && format != "png") {
		return ticketImage{}, "กรุณาเลือกไฟล์รูป JPG หรือ PNG ที่เปิดได้"
	}
	if config.Width < 1 || config.Height < 1 || config.Width > 24_000_000/config.Height {
		return ticketImage{}, "รูปภาพต้องมีความละเอียดไม่เกิน 24 ล้านพิกเซล"
	}
	if _, _, err := image.Decode(bytes.NewReader(content)); err != nil {
		return ticketImage{}, "กรุณาเลือกไฟล์รูป JPG หรือ PNG ที่เปิดได้"
	}
	digest := sha256.Sum256(content)
	return ticketImage{content: content, contentType: "image/" + format, digest: digest[:]}, ""
}

func listTicketImages(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		var imageIDs []string
		err := db.QueryRow(ctx, `
			SELECT ARRAY(SELECT i.id::text FROM ticket_images i WHERE i.ticket_id = tickets.id ORDER BY i.id)
			FROM tickets WHERE `+ticketVisibility+` AND id = $3`,
			c.GetInt64("userID"), canManageTickets(c), id).Scan(&imageIDs)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			ticketError(c, http.StatusNotFound, "ไม่พบ Ticket นี้ในคิว")
		case err != nil:
			ticketDatabaseError(c, "list images", err)
		default:
			c.JSON(http.StatusOK, gin.H{"imageIds": imageIDs})
		}
	}
}

func getTicketImage(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticketID, ticketOK := positiveID(c.Param("id"))
		imageID, imageOK := positiveID(c.Param("imageId"))
		if !ticketOK || !imageOK {
			c.Status(http.StatusNotFound)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		var content []byte
		var contentType string
		err := db.QueryRow(ctx, `
			SELECT i.content, i.content_type FROM tickets t JOIN ticket_images i ON i.ticket_id = t.id
			WHERE `+ticketVisibility+` AND t.id = $3 AND i.id = $4`,
			c.GetInt64("userID"), canManageTickets(c), ticketID, imageID).Scan(&content, &contentType)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			c.Status(http.StatusNotFound)
		case err != nil:
			ticketDatabaseError(c, "get image", err)
		default:
			c.Header("X-Content-Type-Options", "nosniff")
			c.Data(http.StatusOK, contentType, content)
		}
	}
}

func addTicketImage(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := positiveID(c.Param("id"))
		if !ok {
			ticketError(c, http.StatusBadRequest, "รหัส Ticket ไม่ถูกต้อง")
			return
		}
		var input struct {
			Image string `json:"image"`
		}
		if !decodeJSONWithLimit(c, &input, ticketImageJSONLimit) {
			return
		}
		image, message := parseTicketImage(input.Image)
		if message != "" || image.content == nil {
			if message == "" {
				message = "กรุณาเลือกรูปภาพ"
			}
			ticketError(c, http.StatusBadRequest, message)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		tx, err := db.Begin(ctx)
		if err != nil {
			ticketDatabaseError(c, "add image", err)
			return
		}
		defer tx.Rollback(ctx)
		// Lock the ticket so concurrent uploads cannot exceed the per-ticket limit.
		if err := tx.QueryRow(ctx, "SELECT id FROM tickets WHERE id = $1 FOR UPDATE", id).Scan(&id); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				ticketError(c, http.StatusNotFound, "ไม่พบ Ticket นี้ในคิว")
			} else {
				ticketDatabaseError(c, "lock ticket for image", err)
			}
			return
		}
		var count int
		var duplicate bool
		err = tx.QueryRow(ctx, `SELECT count(*), COALESCE(bool_or(digest = $2), false)
			FROM ticket_images WHERE ticket_id = $1`, id, image.digest).Scan(&count, &duplicate)
		if err != nil {
			ticketDatabaseError(c, "check image count", err)
			return
		}
		if duplicate {
			c.Status(http.StatusNoContent)
			return
		}
		if count >= maxTicketImages {
			ticketError(c, http.StatusConflict, "หนึ่งเคสแนบรูปได้สูงสุด 5 รูป")
			return
		}
		_, err = tx.Exec(ctx, "INSERT INTO ticket_images (ticket_id, content_type, digest, content) VALUES ($1, $2, $3, $4)",
			id, image.contentType, image.digest, image.content)
		if err != nil {
			ticketDatabaseError(c, "add image", err)
			return
		}
		if err := tx.Commit(ctx); err != nil {
			ticketDatabaseError(c, "commit image", err)
			return
		}
		c.Status(http.StatusCreated)
	}
}
