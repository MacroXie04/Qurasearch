import { BookmarkIcon, InboxIcon, InfoIcon } from '../icons'

export type CaptureTarget = 'inbox' | 'default' | 'group'

// Tonal banner that tells the user where new clips will land.
export function CaptureBanner({ variant }: { variant: CaptureTarget }) {
  if (variant === 'inbox') {
    return (
      <div className="banner secondary" role="status">
        <span className="banner-icon">
          <InboxIcon />
        </span>
        <div className="banner-body">
          <div className="banner-sub body-small">New clips go to Ungrouped by default</div>
        </div>
      </div>
    )
  }
  if (variant === 'default') {
    return (
      <div className="banner primary" role="status">
        <span className="banner-icon">
          <BookmarkIcon />
        </span>
        <div className="banner-body">
          <div className="banner-title title-small">Default group</div>
          <div className="banner-sub body-small">New clips will be added here</div>
        </div>
      </div>
    )
  }
  return (
    <div className="banner secondary" role="status">
      <span className="banner-icon">
        <InfoIcon />
      </span>
      <div className="banner-body">
        <div className="banner-sub body-small">New clips will be added here</div>
      </div>
    </div>
  )
}
