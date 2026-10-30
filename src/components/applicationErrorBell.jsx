import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../css/applicationErrorBell.css';

// Menu-bar bell icon + dropdown for the backend's application-error log
// (common.models.ApplicationError) - see CLAUDE.md. The actual fetch/poll
// lives in picasaScreen.jsx (same lifted-state pattern as uploads/
// serverStats); this component is purely presentational plus the open/
// closed state for its own dropdown.
function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch (e) {
    return iso
  }
}

function ApplicationErrorBell({ errors, onDismiss }) {
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState(null)
  // Per-row "clear heartbeat too" checkbox, keyed by error id - only ever
  // rendered for rows with a non-null related_heartbeat_task_name (see
  // render below). Deliberately opt-in/unchecked by default: this is meant
  // to be a deliberate "I checked, it's not actually stuck" action, not a
  // reflex tied to the ordinary dismiss click.
  const [clearHeartbeatChecked, setClearHeartbeatChecked] = useState({})
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)
  const count = errors.length

  // Listener only attached while actually open, and always removed on
  // close/unmount - same discipline as every other document-level
  // listener in this app (see CLAUDE.md: a missing cleanup here caused a
  // real prod bug elsewhere). 'mousedown' rather than 'click' so this
  // fires before the dropdown's own onClick handlers (e.g. Dismiss) would
  // otherwise re-render the list out from under a 'click' listener.
  // Checks both refs since the dropdown itself is portaled outside the
  // button's own DOM subtree - a click on the dropdown isn't "outside"
  // just because it's not a DOM descendant of .applicationErrorBell.
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event) => {
      if (buttonRef.current && buttonRef.current.contains(event.target)) return
      if (dropdownRef.current && dropdownRef.current.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // #menuBar clips (overflow: hidden, fixed height) anything positioned
  // relative to it that extends below its own box - the same problem
  // MutableSelect's dropdown and the per-tile context menu already hit
  // (see CLAUDE.md's "position: fixed" writeups), fixed there the same
  // way: portal straight to document.body instead of relying on a
  // positioned ancestor that happens to clip. Position is computed from
  // the button's own screen rect at open time rather than tracked live -
  // #menuBar is itself position:fixed/full-width, so its own layout (and
  // this button's position within it) can't shift while the dropdown is
  // open anyway.
  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    setOpen(!open)
  }

  return (
    <div className='applicationErrorBell'>
      <button
        ref={buttonRef}
        className='applicationErrorBellButton'
        onClick={handleToggle}
        title={count > 0 ? `${count} unread notification(s)` : 'No new notifications'}
      >
        <span className='applicationErrorBellIcon'>&#128276;</span>
        {count > 0 && <span className='applicationErrorBadge'>{count > 99 ? '99+' : count}</span>}
      </button>

      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className='applicationErrorDropdown'
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
        >
          {count === 0 ? (
            <div className='applicationErrorEmpty'>No new notifications.</div>
          ) : (
            errors.map(err => (
              <div className='applicationErrorRow' key={err.id}>
                <div className='applicationErrorRowHeader'>
                  <span className='applicationErrorSource'>{err.source}</span>
                  <button
                    className='applicationErrorDismiss'
                    onClick={() => onDismiss(err.id, !!clearHeartbeatChecked[err.id])}
                    title='Dismiss'
                  >
                    &times;
                  </button>
                </div>
                <div className='applicationErrorMessage'>{err.message}</div>
                {err.related_heartbeat_task_name && (
                  <label className='applicationErrorClearHeartbeat'>
                    <input
                      type='checkbox'
                      checked={!!clearHeartbeatChecked[err.id]}
                      onChange={(e) => setClearHeartbeatChecked(prev => ({ ...prev, [err.id]: e.target.checked }))}
                    />
                    {' '}I've confirmed this isn't actually stuck — clear it
                  </label>
                )}
                <div className='applicationErrorTimestamp'>{formatTimestamp(err.created_at)}</div>
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export default ApplicationErrorBell
