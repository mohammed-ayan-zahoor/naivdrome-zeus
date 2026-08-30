import { AddToPlaylistDialog } from './AddToPlaylistDialog'
import DownloadMenuDialog from './DownloadMenuDialog'
import { HelpDialog } from './HelpDialog'
import { ShareDialog } from './ShareDialog'
import { SaveQueueDialog } from './SaveQueueDialog'
import { UploadDialog } from './UploadDialog'

export const Dialogs = (props) => (
  <>
    <AddToPlaylistDialog />
    <SaveQueueDialog />
    <DownloadMenuDialog />
    <HelpDialog />
    <ShareDialog />
    <UploadDialog />
  </>
)
