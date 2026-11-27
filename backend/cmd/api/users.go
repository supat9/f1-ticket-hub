package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
)

const minPasswordCharacters = 6

var (
	errInvalidEmail    = errors.New("provide a valid work email address")
	errInvalidPassword = fmt.Errorf("password must contain at least %d characters and at most 72 bytes", minPasswordCharacters)
	errDuplicateEmail  = errors.New("an account with that email already exists")
)

func validWorkEmail(email string) bool {
	address, err := mail.ParseAddress(email)
	return err == nil && address.Address == email && len(email) <= 254
}

func createUser(db *pgxpool.Pool, input, role string) error {
	email := normalizeEmail(input)
	if !validWorkEmail(email) {
		return errInvalidEmail
	}
	if role != roleAdmin && !isTeamRole(role) {
		return errors.New("role must be admin, cs or dev")
	}

	stdin := int(os.Stdin.Fd())
	reader := bufio.NewScanner(os.Stdin)
	readPassword := func(prompt string) ([]byte, error) {
		if term.IsTerminal(stdin) {
			fmt.Fprint(os.Stderr, prompt)
			value, err := term.ReadPassword(stdin)
			fmt.Fprintln(os.Stderr)
			return value, err
		}
		if !reader.Scan() {
			return nil, errors.New("provide the password twice on separate lines")
		}
		return []byte(reader.Text()), nil
	}

	password, err := readPassword("Password: ")
	if err != nil {
		return err
	}
	defer clear(password)
	confirmation, err := readPassword("Confirm password: ")
	if err != nil {
		return err
	}
	defer clear(confirmation)
	if !bytes.Equal(password, confirmation) {
		return errors.New("passwords do not match")
	}
	if err := registerUser(context.Background(), db, email, password, role); err != nil {
		return err
	}
	fmt.Printf("Created %s account %s\n", role, email)
	return nil
}

func registerUser(ctx context.Context, db *pgxpool.Pool, email string, password []byte, role string) error {
	if !validWorkEmail(email) {
		return errInvalidEmail
	}
	hash, err := hashUserPassword(password)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	result, err := db.Exec(ctx, "INSERT INTO app_users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
		email, string(hash), role)
	if err != nil {
		return errors.New("could not create account; check the database connection and auth migration")
	}
	if result.RowsAffected() == 0 {
		return errDuplicateEmail
	}
	return nil
}

func hashUserPassword(password []byte) ([]byte, error) {
	if utf8.RuneCount(password) < minPasswordCharacters || len(password) > 72 {
		return nil, errInvalidPassword
	}
	return bcrypt.GenerateFromPassword(password, passwordCost)
}
