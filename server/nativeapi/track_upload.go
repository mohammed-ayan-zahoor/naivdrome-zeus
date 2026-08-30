package nativeapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model/request"
)

var supportedAudioExtensions = map[string]bool{
	".mp3":  true,
	".flac": true,
	".m4a":  true,
	".m4b":  true,
	".aac":  true,
	".ogg":  true,
	".opus": true,
	".wav":  true,
	".wma":  true,
	".alac": true,
	".aiff": true,
	".aif":  true,
	".dsf":  true,
	".dff":  true,
	".ape":  true,
	".mpc":  true,
}

func (api *Router) addTrackUploadRoute(r chi.Router) {
	r.Post("/upload/track", handleTrackUpload(api))
}

func handleTrackUpload(api *Router) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		user, ok := request.UserFrom(ctx)
		if !ok || user.ID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		mr, err := r.MultipartReader()
		if err != nil {
			log.Error(ctx, "Error getting multipart reader for track upload", err)
			http.Error(w, "Invalid multipart request", http.StatusBadRequest)
			return
		}

		targetBaseDir := conf.Server.MusicFolder
		if targetBaseDir == "" {
			targetBaseDir = "./data/music"
		}
		absBaseDir, err := filepath.Abs(targetBaseDir)
		if err != nil {
			log.Error(ctx, "Error resolving base music directory", "dir", targetBaseDir, err)
			http.Error(w, "Server storage error", http.StatusInternalServerError)
			return
		}

		var uploadedCount int
		var savedFiles []string

		for {
			part, err := mr.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				log.Error(ctx, "Error reading multipart chunk", err)
				http.Error(w, "Failed to read upload stream", http.StatusBadRequest)
				return
			}

			if part.FormName() != "file" && part.FormName() != "files[]" {
				_ = part.Close()
				continue
			}

			rawFilename := part.FileName()
			if rawFilename == "" {
				_ = part.Close()
				continue
			}

			// Clean relative path (handles folder drag-and-drop structures if present in header/filename)
			relPath := rawFilename
			if customRel := r.Header.Get("X-Relative-Path"); customRel != "" {
				relPath = customRel
			}
			relPath = filepath.Clean(filepath.ToSlash(relPath))
			relPath = strings.TrimPrefix(relPath, "/")
			for strings.HasPrefix(relPath, "../") {
				relPath = strings.TrimPrefix(relPath, "../")
			}

			ext := strings.ToLower(filepath.Ext(relPath))
			if !supportedAudioExtensions[ext] {
				_ = part.Close()
				log.Warn(ctx, "Unsupported file extension for track upload", "filename", rawFilename, "ext", ext)
				http.Error(w, fmt.Sprintf("Unsupported file format: %s", ext), http.StatusBadRequest)
				return
			}

			destPath := filepath.Join(absBaseDir, relPath)
			absDest, err := filepath.Abs(destPath)
			if err != nil || !strings.HasPrefix(absDest, absBaseDir) {
				_ = part.Close()
				log.Error(ctx, "Illegal path traversal attempt in track upload", "raw", rawFilename, "dest", destPath)
				http.Error(w, "Invalid file path", http.StatusBadRequest)
				return
			}

			if err := os.MkdirAll(filepath.Dir(absDest), 0o755); err != nil {
				_ = part.Close()
				log.Error(ctx, "Error creating destination folder", "dir", filepath.Dir(absDest), err)
				http.Error(w, "Failed to create directory on server", http.StatusInternalServerError)
				return
			}

			out, err := os.OpenFile(absDest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
			if err != nil {
				_ = part.Close()
				log.Error(ctx, "Error opening destination file for write", "file", absDest, err)
				http.Error(w, "Failed to write file to disk", http.StatusInternalServerError)
				return
			}

			bytesWritten, err := io.Copy(out, part)
			_ = out.Close()
			_ = part.Close()

			if err != nil {
				log.Error(ctx, "Error writing track to disk", "file", absDest, err)
				http.Error(w, "Failed to stream file to disk", http.StatusInternalServerError)
				return
			}

			uploadedCount++
			savedFiles = append(savedFiles, relPath)
			log.Info(ctx, "Track uploaded successfully", "user", user.UserName, "path", relPath, "bytes", bytesWritten)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok",
			"count":  uploadedCount,
			"files":  savedFiles,
		})
	}
}
