import React, { useState, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNotify } from 'react-admin'
import {
  Dialog,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  makeStyles,
  Chip,
  Paper,
} from '@material-ui/core'
import {
  MdCloudUpload,
  MdCheckCircle,
  MdErrorOutline,
  MdAudiotrack,
  MdFolderOpen,
} from 'react-icons/md'
import { DialogTitle } from './DialogTitle'
import { DialogContent } from './DialogContent'
import { closeUploadMusic } from '../actions'
import { baseUrl } from '../utils'
import { clientUniqueId, clientUniqueIdHeader } from '../dataProvider/httpClient'

const CONCURRENT_UPLOADS = 4

const useStyles = makeStyles((theme) => ({
  dialogPaper: {
    minWidth: 550,
    maxWidth: 700,
    minHeight: 480,
    maxHeight: '85vh',
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  dropzone: {
    border: `2px dashed ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    padding: theme.spacing(4),
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 255, 255, 0.03)'
        : 'rgba(0, 0, 0, 0.02)',
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      borderColor: theme.palette.primary.main,
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.06)'
          : 'rgba(0, 0, 0, 0.04)',
    },
  },
  dropzoneActive: {
    borderColor: theme.palette.primary.main,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(63, 81, 181, 0.15)'
        : 'rgba(63, 81, 181, 0.08)',
  },
  dropIcon: {
    fontSize: 54,
    color: theme.palette.primary.main,
    marginBottom: theme.spacing(1),
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(2),
    marginTop: theme.spacing(2),
  },
  progressContainer: {
    marginTop: theme.spacing(1),
    padding: theme.spacing(2),
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 255, 255, 0.04)'
        : 'rgba(0, 0, 0, 0.03)',
    borderRadius: theme.shape.borderRadius,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  fileList: {
    maxHeight: 220,
    overflowY: 'auto',
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    marginTop: theme.spacing(1),
  },
  fileItem: {
    paddingTop: theme.spacing(0.75),
    paddingBottom: theme.spacing(0.75),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  successIcon: {
    color: theme.palette.success?.main || '#4caf50',
  },
  errorIcon: {
    color: theme.palette.error.main,
  },
  audioIcon: {
    color: theme.palette.text.secondary,
  },
}))

export const UploadDialog = () => {
  const classes = useStyles()
  const dispatch = useDispatch()
  const notify = useNotify()
  const open = useSelector((state) => state.uploadMusicDialog?.open || false)

  const [filesQueue, setFilesQueue] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [totalBytesUploaded, setTotalBytesUploaded] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)

  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const isUploadingRef = useRef(false)

  const handleClose = () => {
    if (isUploading) {
      if (!window.confirm('Upload is in progress. Are you sure you want to cancel and close?')) {
        return
      }
    }
    setFilesQueue([])
    setIsUploading(false)
    setTotalBytesUploaded(0)
    setTotalBytes(0)
    dispatch(closeUploadMusic())
  }

  const uploadSingleFile = (fileItem) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const uploadUrl = baseUrl('/api/upload/track')
      xhr.open('POST', uploadUrl, true)

      const token = localStorage.getItem('token')
      if (token) {
        xhr.setRequestHeader('X-ND-Authorization', `Bearer ${token}`)
      }
      xhr.setRequestHeader(clientUniqueIdHeader, clientUniqueId)
      if (fileItem.relativePath) {
        xhr.setRequestHeader('X-Relative-Path', fileItem.relativePath)
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setFilesQueue((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? { ...item, progress: Math.round((e.loaded / e.total) * 100) }
                : item,
            ),
          )
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFilesQueue((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? { ...item, status: 'success', progress: 100 }
                : item,
            ),
          )
          resolve(true)
        } else {
          setFilesQueue((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? { ...item, status: 'error', error: xhr.statusText || 'Upload failed' }
                : item,
            ),
          )
          resolve(false)
        }
      }

      xhr.onerror = () => {
        setFilesQueue((prev) =>
          prev.map((item) =>
            item.id === fileItem.id
              ? { ...item, status: 'error', error: 'Network error' }
              : item,
          ),
        )
        resolve(false)
      }

      const formData = new FormData()
      formData.append('file', fileItem.file, fileItem.file.name)
      xhr.send(formData)
    })
  }

  const startUploadPool = useCallback(async (items) => {
    setIsUploading(true)
    isUploadingRef.current = true

    let index = 0
    const running = new Set()
    let completedCount = 0
    let successCount = 0

    const executeNext = async () => {
      while (index < items.length && isUploadingRef.current) {
        const item = items[index++]
        setFilesQueue((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: 'uploading' } : it,
          ),
        )

        const promise = uploadSingleFile(item).then((ok) => {
          completedCount++
          if (ok) successCount++
          running.delete(promise)
        })

        running.add(promise)
        if (running.size >= CONCURRENT_UPLOADS) {
          await Promise.race(running)
        }
      }
      await Promise.all(running)
    }

    await executeNext()
    setIsUploading(false)
    isUploadingRef.current = false

    notify(`Uploaded ${successCount} songs successfully!`, 'info')
  }, [notify])

  const handleAddFiles = (fileList) => {
    const audioExtensions = [
      '.mp3',
      '.flac',
      '.m4a',
      '.m4b',
      '.aac',
      '.ogg',
      '.opus',
      '.wav',
      '.wma',
      '.alac',
      '.aiff',
      '.dsf',
      '.dff',
      '.ape',
      '.mpc',
    ]

    const newItems = []
    let bytesSum = 0

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      const name = file.name.toLowerCase()
      const isAudio = audioExtensions.some((ext) => name.endsWith(ext))
      if (!isAudio) continue

      const relativePath = file.webkitRelativePath || file.name
      bytesSum += file.size

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${i}`,
        file,
        name: file.name,
        relativePath,
        size: file.size,
        status: 'pending',
        progress: 0,
      })
    }

    if (newItems.length === 0) {
      notify('No valid audio files found in selection.', 'warning')
      return
    }

    setFilesQueue((prev) => [...prev, ...newItems])
    setTotalBytes((prev) => prev + bytesSum)
    startUploadPool(newItems)
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files)
    }
  }

  const completedFiles = filesQueue.filter((f) => f.status === 'success').length
  const failedFiles = filesQueue.filter((f) => f.status === 'error').length
  const totalCount = filesQueue.length
  const overallPercentage =
    totalCount > 0 ? Math.round((completedFiles / totalCount) * 100) : 0

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      classes={{ paper: classes.dialogPaper }}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle onClose={handleClose}>Upload Music</DialogTitle>
      <DialogContent className={classes.dialogContent}>
        <Paper
          className={`${classes.dropzone} ${dragActive ? classes.dropzoneActive : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          elevation={0}
        >
          <MdCloudUpload className={classes.dropIcon} />
          <Typography variant="h6" color="textPrimary">
            Drag & drop songs or folders here
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Supports MP3, FLAC, M4A, AAC, OPUS, WAV, ALAC, and more
          </Typography>

          <div
            className={classes.buttonGroup}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              accept="audio/*,.mp3,.flac,.m4a,.m4b,.aac,.ogg,.opus,.wav,.wma,.alac,.aiff,.dsf"
              onChange={(e) => handleAddFiles(e.target.files)}
            />
            <input
              type="file"
              ref={(node) => {
                folderInputRef.current = node
                if (node) {
                  node.setAttribute('webkitdirectory', '')
                  node.setAttribute('directory', '')
                }
              }}
              style={{ display: 'none' }}
              multiple
              onChange={(e) => handleAddFiles(e.target.files)}
            />
            <Button
              variant="outlined"
              color="primary"
              startIcon={<MdAudiotrack />}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Choose Files
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<MdFolderOpen />}
              onClick={() => folderInputRef.current?.click()}
              disabled={isUploading}
            >
              Choose Folder
            </Button>
          </div>
        </Paper>

        {totalCount > 0 && (
          <div className={classes.progressContainer}>
            <div className={classes.statsRow}>
              <Typography variant="subtitle2" color="textPrimary">
                {isUploading ? 'Uploading tracks...' : 'Upload complete'}
              </Typography>
              <Box display="flex" alignItems="center" gridGap={8}>
                <Chip
                  size="small"
                  label={`${completedFiles} / ${totalCount} songs`}
                  color="primary"
                />
                {failedFiles > 0 && (
                  <Chip
                    size="small"
                    label={`${failedFiles} failed`}
                    color="secondary"
                  />
                )}
              </Box>
            </div>
            <LinearProgress
              variant="determinate"
              value={overallPercentage}
              style={{ height: 8, borderRadius: 4 }}
            />
            <Box display="flex" justifyContent="space-between" mt={1}>
              <Typography variant="caption" color="textSecondary">
                Total size: {formatFileSize(totalBytes)}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {overallPercentage}%
              </Typography>
            </Box>

            <List className={classes.fileList} dense>
              {filesQueue.map((item) => (
                <ListItem key={item.id} className={classes.fileItem}>
                  <ListItemIcon style={{ minWidth: 36 }}>
                    {item.status === 'success' ? (
                      <MdCheckCircle className={classes.successIcon} size={20} />
                    ) : item.status === 'error' ? (
                      <MdErrorOutline className={classes.errorIcon} size={20} />
                    ) : (
                      <MdAudiotrack className={classes.audioIcon} size={20} />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.relativePath || item.name}
                    secondary={
                      item.status === 'uploading'
                        ? `Uploading (${item.progress}%)`
                        : item.status === 'error'
                          ? item.error
                          : formatFileSize(item.size)
                    }
                    primaryTypographyProps={{
                      noWrap: true,
                      variant: 'body2',
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" variant="contained">
          {isUploading ? 'Cancel' : 'Done'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default UploadDialog
