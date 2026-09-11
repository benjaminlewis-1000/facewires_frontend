import React from 'react';
import '../css/googlePhotos.css';

// The actual sync pipeline (session init/poll/complete against
// api/photos_watch_views.py) lives in picasaScreen.jsx, not here - this
// component is a thin, unmounts-on-tab-switch view over watches/
// syncSessions/onFetchWatches/onAddWatch/onRemoveWatch/onStartSync/
// onDismissSync props threaded down from there. Same reasoning as
// UploadTool's own equivalent comment - a sync waits on the user
// finishing selection in a separate Google Photos tab, which can easily
// outlast a visit to this one.
function formatDate(isoString) {
  if (!isoString) return 'never'
  return new Date(isoString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

class GooglePhotosTool extends React.Component {
  constructor(props) {
    super(props);
    this.state = { newTitle: '' };
    this.handleAdd = this.handleAdd.bind(this);
  }

  componentDidMount() {
    this.props.onFetchWatches();
  }

  handleAdd(event) {
    event.preventDefault();
    const title = this.state.newTitle.trim();
    if (!title) return;
    this.props.onAddWatch(title);
    this.setState({ newTitle: '' });
  }

  renderSyncStatus(watch, session) {
    const { onStartSync, onRemoveWatch, onDismissSync } = this.props;

    if (!session) {
      return (
        <div className="googlePhotosWatchActions">
          <button onClick={() => onStartSync(watch.id)}>Sync now</button>
          <button onClick={() => onRemoveWatch(watch.id)}>Remove</button>
        </div>
      );
    }

    if (session.status === 'picking' || session.status === 'polling') {
      return (
        <div className="googlePhotosWatchStatus">
          <span>Waiting for you to finish selecting in Google Photos…</span>
          {session.status === 'polling' && (
            <button onClick={() => onStartSync(watch.id)}>Reopen Google Photos</button>
          )}
        </div>
      );
    }

    if (session.status === 'completing') {
      return <div className="googlePhotosWatchStatus"><span>Downloading new photos…</span></div>;
    }

    if (session.status === 'failed') {
      return (
        <div className="googlePhotosWatchStatus googlePhotosWatchError">
          <span>{session.error}</span>
          <button onClick={() => onDismissSync(watch.id)}>Dismiss</button>
        </div>
      );
    }

    // completed
    return (
      <div className="googlePhotosWatchStatus">
        <span>
          {session.result.new_count} new photo{session.result.new_count === 1 ? '' : 's'} downloaded
          {session.result.already_had_count > 0 ? `, ${session.result.already_had_count} already had` : ''}.
        </span>
        <button onClick={() => onDismissSync(watch.id)}>Dismiss</button>
      </div>
    );
  }

  render() {
    const watches = this.props.watches || [];
    return (
      <div className="googlePhotosTool">
        <p className="googlePhotosBlurb">
          Google's own API has no way to watch an album for new photos automatically -
          each sync opens Google Photos so you can reselect what's there, then only the
          photos not already downloaded are pulled in.
        </p>

        <form className="googlePhotosAddForm" onSubmit={this.handleAdd}>
          <input
            type="text"
            placeholder="Name this album (e.g. Mom's trip photos)"
            value={this.state.newTitle}
            onChange={(e) => this.setState({ newTitle: e.target.value })}
          />
          <button type="submit">Add album</button>
        </form>

        <div className="googlePhotosWatchList">
          {watches.map(watch => (
            <div key={watch.id} className="googlePhotosWatchRow">
              <div className="googlePhotosWatchHeader">
                <span className="googlePhotosWatchTitle">{watch.title}</span>
                <span className="googlePhotosWatchMeta">
                  {watch.item_count} photo{watch.item_count === 1 ? '' : 's'} · last synced {formatDate(watch.last_synced_at)}
                </span>
              </div>
              {this.renderSyncStatus(watch, this.props.syncSessions[watch.id])}
            </div>
          ))}
          {watches.length === 0 && <p className="googlePhotosBlurb">No albums added yet.</p>}
        </div>
      </div>
    );
  }
}

export default GooglePhotosTool;
