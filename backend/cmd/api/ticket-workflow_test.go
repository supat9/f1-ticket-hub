package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestTicketWorkflowRecordsOnlyAuthorizedChanges(t *testing.T) {
	db := integrationTestDatabase(t)
	if _, err := db.Exec(t.Context(), `INSERT INTO app_users (email, password_hash, role) VALUES
		('support@example.com', 'unused', 'cs'), ('dev@example.com', 'unused', 'dev'), ('unassigned@example.com', 'unused', 'dev')`); err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	router.Use(func(c *gin.Context) {
		id, _ := positiveID(c.GetHeader("X-Test-Actor"))
		role := roleDev
		if id == 1 {
			role = roleCS
		}
		c.Set("userID", id)
		c.Set("userRole", role)
	})
	router.POST("/tickets", createTicket(db))
	router.PATCH("/tickets/:id/workflow", updateTicketWorkflow(db))
	router.PATCH("/tickets/:id/status", updateTicketStatus(db))
	router.POST("/tickets/:id/notes", addTicketNote(db))
	router.GET("/tickets/:id/workflow", loadTicketWorkflow(db))
	router.GET("/reports", ticketReport(db))
	request := func(method, path, actor, payload string, want int) []byte {
		t.Helper()
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-Actor", actor)
		if path == "/tickets/1/notes" {
			req.Header.Set("Idempotency-Key", "85c4fab4-b7cb-4b59-ac89-2187da0105cc")
		}
		router.ServeHTTP(recorder, req)
		if recorder.Code != want {
			t.Fatalf("%s %s as %s: got %d, want %d: %s", method, path, actor, recorder.Code, want, recorder.Body)
		}
		return recorder.Body.Bytes()
	}

	const workflow = "/tickets/1/workflow"
	request("POST", "/tickets", "1", `{"title":"Test checkout retry", "description":"Duplicate order", "priority":"urgent", "source":"customer"}`, http.StatusCreated)
	request("GET", workflow, "3", "", http.StatusNotFound)
	request("PATCH", workflow, "1", `{"action":"handoff","version":0,"assigneeId":"2","steps":"Retry after timeout","impact":"Duplicate order"}`, http.StatusNoContent)
	request("PATCH", workflow, "2", `{"action":"start","version":1}`, http.StatusNoContent)
	request("PATCH", "/tickets/1/status", "2", `{"expectedStatus":"in_progress","status":"closed"}`, http.StatusConflict)
	request("PATCH", workflow, "2", `{"action":"submit","version":2,"resolution":"Retry test returns one order","pullRequestUrl":"https://example.com/pr/42"}`, http.StatusNoContent)
	request("PATCH", workflow, "2", `{"action":"close","version":3,"reviewNote":"Wrong role"}`, http.StatusForbidden)
	request("PATCH", workflow, "1", `{"action":"close","version":2,"reviewNote":"Stale version"}`, http.StatusConflict)
	request("PATCH", workflow, "1", `{"action":"close","version":3,"reviewNote":"Verified checkout"}`, http.StatusNoContent)
	request("POST", "/tickets/1/notes", "1", `{"note":"Follow-up"}`, http.StatusCreated)
	request("POST", "/tickets/1/notes", "1", `{"note":"Follow-up"}`, http.StatusCreated)
	request("POST", "/tickets/1/notes", "1", `{"note":"Changed note"}`, http.StatusConflict)

	var result workflowView
	if err := json.Unmarshal(request("GET", workflow, "1", "", http.StatusOK), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Activity) != 7 || result.Activity[0].Kind != "note" || result.Activity[1].Kind != "close" || result.Activity[2].Actor != "dev@example.com" {
		t.Fatalf("unexpected activity: %+v", result.Activity)
	}
	var report ticketReportResult
	if err := json.Unmarshal(request("GET", "/reports", "1", "", http.StatusOK), &report); err != nil {
		t.Fatal(err)
	}
	if report.Total != 1 || report.ResolvedInTime != 1 || report.Started != 1 || report.MedianResolutionHours == nil {
		t.Fatalf("unexpected report: %+v", report)
	}
}
