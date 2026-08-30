package nativeapi

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

func TestTrackUpload(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "nd_upload_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	conf.Server.MusicFolder = tempDir
	api := &Router{}
	handler := handleTrackUpload(api)

	user := model.User{
		ID:       "test-user-id",
		UserName: "testuser",
		IsAdmin:  true,
	}

	t.Run("successful mp3 upload", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "song.mp3")
		if err != nil {
			t.Fatalf("Failed to create form file: %v", err)
		}
		_, _ = part.Write([]byte("FAKE_MP3_AUDIO_CONTENT"))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/upload/track", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req = req.WithContext(request.WithUser(req.Context(), user))

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		uploadedFilePath := filepath.Join(tempDir, "song.mp3")
		if _, err := os.Stat(uploadedFilePath); os.IsNotExist(err) {
			t.Fatalf("Expected file to be written at %s", uploadedFilePath)
		}
	})

	t.Run("rejects unsupported extensions", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "malware.exe")
		if err != nil {
			t.Fatalf("Failed to create form file: %v", err)
		}
		_, _ = part.Write([]byte("EXE_CONTENT"))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/upload/track", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req = req.WithContext(request.WithUser(req.Context(), user))

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 for bad extension, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("sanitizes relative path and folder structures", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "track.flac")
		if err != nil {
			t.Fatalf("Failed to create form file: %v", err)
		}
		_, _ = part.Write([]byte("FLAC_CONTENT"))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/upload/track", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("X-Relative-Path", "Artist/Album/track.flac")
		req = req.WithContext(request.WithUser(req.Context(), user))

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		uploadedFilePath := filepath.Join(tempDir, "Artist", "Album", "track.flac")
		if _, err := os.Stat(uploadedFilePath); os.IsNotExist(err) {
			t.Fatalf("Expected nested file to be written at %s", uploadedFilePath)
		}
	})
}
