package main

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func setTicketWriteContext(ctx context.Context, tx pgx.Tx, actorID int64, action, detail string) error {
	_, err := tx.Exec(ctx, `SELECT set_config('f1.actor_id', $1, true),
		set_config('f1.workflow_action', $2, true), set_config('f1.activity_detail', $3, true)`,
		strconv.FormatInt(actorID, 10), action, detail)
	return err
}

func ticketWrite[T any](ctx context.Context, db *pgxpool.Pool, actorID int64, write func(pgx.Tx) (T, error)) (T, error) {
	var result T
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if err := setTicketWriteContext(ctx, tx, actorID, "", ""); err != nil {
			return err
		}
		var err error
		result, err = write(tx)
		return err
	})
	return result, err
}

func writeTicketRow(ctx context.Context, db *pgxpool.Pool, actorID int64, query string, args ...any) (ticket, error) {
	return ticketWrite(ctx, db, actorID, func(tx pgx.Tx) (ticket, error) {
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return ticket{}, err
		}
		return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[ticket])
	})
}
