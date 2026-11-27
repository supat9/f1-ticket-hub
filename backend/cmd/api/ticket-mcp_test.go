package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestDeveloperMCP(t *testing.T) {
	db := integrationTestDatabase(t)
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO app_users(email,password_hash,role) VALUES('dev@example.com','test','dev'),('other@example.com','test','dev');
 INSERT INTO tickets(request_id,title,description,source,assignee_id) VALUES(gen_random_uuid(),'Assigned','Work to do','internal',1),(gen_random_uuid(),'Private','Private report','internal',2),(gen_random_uuid(),'Guided','Reproduce error','internal',1);
 UPDATE tickets SET handoff_steps='Retry payment',handoff_impact='Duplicate order',workflow_version=1 WHERE id=3`)
	var secret [32]byte
	rand.Read(secret[:])
	token := base64.RawURLEncoding.EncodeToString(secret[:])
	hash := sha256.Sum256([]byte(token))
	exec(`INSERT INTO dev_automation_tokens(user_id,token_hash,expires_at) VALUES(1,$1,now()+interval '1 hour')`, hash[:])
	router := gin.New()
	registerTicketMCP(router, db)
	request := func(method string, params any, wantHTTP int) map[string]any {
		t.Helper()
		msg, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
		req := httptest.NewRequest("POST", "/mcp", bytes.NewReader(msg))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/json, text/event-stream")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != wantHTTP {
			t.Fatalf("%s: %d: %s", method, rec.Code, rec.Body.String())
		}
		if wantHTTP != 200 {
			return nil
		}
		var reply struct {
			Result map[string]any
			Error  any
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil || reply.Error != nil || reply.Result == nil {
			t.Fatalf("%s: %s", method, rec.Body.String())
		}
		return reply.Result
	}
	call := func(name string, args map[string]any, fail bool) map[string]any {
		t.Helper()
		r := request("tools/call", map[string]any{"name": name, "arguments": args}, 200)
		if (r["isError"] == true) != fail {
			t.Fatalf("%s: %v", name, r)
		}
		if fail {
			return nil
		}
		return r["structuredContent"].(map[string]any)
	}
	request("initialize", map[string]any{"protocolVersion": "2025-11-25", "capabilities": map[string]any{}, "clientInfo": map[string]any{"name": "test", "version": "1"}}, 200)
	if n := len(request("tools/list", map[string]any{}, 200)["tools"].([]any)); n != 5 {
		t.Fatalf("got %d tools", n)
	}
	page := call("f1_list_tickets", map[string]any{}, false)
	if n := len(page["tickets"].([]any)); n != 2 {
		t.Fatalf("listed %d tickets", n)
	}
	// Bangkok midnight is the boundary even when the database session uses UTC.
	exec(`UPDATE tickets SET priority='urgent', created_at = (((now() AT TIME ZONE 'Asia/Bangkok')::date)::timestamp AT TIME ZONE 'Asia/Bangkok') + CASE WHEN id=1 THEN interval '-1 minute' ELSE interval '20 hours' END`)
	for window, want := range map[string]string{"created_today": "F1-000003", "due_today": "F1-000001"} {
		rows := call("f1_list_tickets", map[string]any{"window": window}, false)["tickets"].([]any)
		if len(rows) != 1 {
			t.Fatalf("%s: %v", window, rows)
		}
		item := rows[0].(map[string]any)
		if item["code"] != want || item["createdAt"] == nil || item["dueAt"] == nil {
			t.Fatal(item)
		}
	}
	call("f1_list_tickets", map[string]any{"window": "yesterday"}, true)
	if d := call("f1_get_ticket", map[string]any{"code": "F1-000003"}, false); d["workflowVersion"] != float64(1) || d["title"] != "Guided" {
		t.Fatal(d)
	}
	call("f1_get_ticket", map[string]any{"code": "F1-000002"}, true)
	note := map[string]any{"code": "F1-000001", "requestId": "4e7f3644-e621-49f5-86dc-82734fa0b9ec", "note": "Reproduced in checkout"}
	call("f1_add_note", note, false)
	call("f1_add_note", note, false)
	note["note"] = "Changed evidence"
	call("f1_add_note", note, true)
	update := map[string]any{"code": "F1-000001", "requestId": "start-1", "expectedStatus": "open", "status": "in_progress", "evidence": "Reproduced locally"}
	if call("f1_update_status", update, false)["changed"] != true || call("f1_update_status", update, false)["changed"] != false {
		t.Fatal("retry changed data")
	}
	update["requestId"] = "stale"
	call("f1_update_status", update, true)
	update["code"] = "F1-000003"
	call("f1_update_status", update, true)
	wf := map[string]any{"code": "F1-000003", "action": "start", "version": 1}
	call("f1_update_handoff", wf, false)
	call("f1_update_handoff", wf, true)
	wf["action"] = "submit"
	wf["version"] = 2
	wf["resolution"] = "Retry test passes"
	wf["pullRequestUrl"] = "https://example.org/pr/42"
	call("f1_update_handoff", wf, false)
	wf["action"] = "close"
	wf["version"] = 3
	call("f1_update_handoff", wf, true)
	var count int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM ticket_activity WHERE actor_id=1 AND kind IN ('note','submit','automation')").Scan(&count); err != nil || count != 3 {
		t.Fatalf("audit count %d: %v", count, err)
	}
	exec("DELETE FROM dev_automation_tokens WHERE user_id=1")
	request("tools/list", map[string]any{}, 401)
}
