import React from 'react';
import store from 'store';
import '../css/googlePhotos.css';
import { getCredentialStatus, saveCredentials, oauthStartUrl } from './googlePhotosActions';

// Computed rather than hardcoded so the number shown always matches
// whatever api_url this build/environment is actually pointed at (dev vs
// prod use different domains - see CLAUDE.md) - the value the user needs
// to paste into Cloud Console as the OAuth client's authorized redirect
// URI must match this exactly, byte for byte, or Google rejects the
// callback with a redirect_uri_mismatch error.
function oauthCallbackUrl() {
  return store.get('api_url') + '/google_photos/oauth/callback/';
}

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
    this.state = {
      newTitle: '',
      // null while the initial GET is in flight - distinct from "fetched
      // and not configured", which the connection panel below renders
      // differently (a form to fill in vs nothing to show yet).
      credentialStatus: null,
      clientIdInput: '', clientSecretInput: '',
      savingCredentials: false, credentialError: null,
    };
    this.handleAdd = this.handleAdd.bind(this);
    this.handleSaveCredentials = this.handleSaveCredentials.bind(this);
  }

  componentDidMount() {
    this.props.onFetchWatches();
    this.fetchCredentialStatus();
  }

  fetchCredentialStatus() {
    getCredentialStatus()
      .then(response => this.setState({ credentialStatus: response.data, clientIdInput: response.data.client_id }))
      .catch(error => console.log('Failed to fetch Google Photos credential status', error))
  }

  handleSaveCredentials(event) {
    event.preventDefault();
    const clientId = this.state.clientIdInput.trim();
    const clientSecret = this.state.clientSecretInput.trim();
    if (!clientId || !clientSecret) return;
    this.setState({ savingCredentials: true, credentialError: null });
    saveCredentials(clientId, clientSecret)
      .then(response => this.setState({ credentialStatus: response.data, savingCredentials: false, clientSecretInput: '' }))
      .catch(error => this.setState({
        savingCredentials: false,
        credentialError: error?.response?.data?.error || 'Could not save these credentials.',
      }))
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

  renderConnectionPanel() {
    const status = this.state.credentialStatus;
    if (!status) return null;

    if (!status.configured) {
      return (
        <div className="googlePhotosConnectionPanel">
          <p className="googlePhotosBlurb">
            One-time setup in Google Cloud Console before this can connect:
          </p>
          <ol className="googlePhotosSetupSteps">
            <li>
              At <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a>,
              create or reuse a project, then under <strong>APIs &amp; Services → Library</strong>, enable the{' '}
              <strong>Google Photos Picker API</strong>.
            </li>
            <li>
              Under <strong>APIs &amp; Services → Credentials</strong>, create an OAuth 2.0 Client ID of type{' '}
              <strong>"Web application"</strong> (not "Desktop app"). Add this exact URL as an authorized redirect URI:
              <div className="googlePhotosCodeBox">{oauthCallbackUrl()}</div>
            </li>
            <li>
              Under <strong>APIs &amp; Services → OAuth consent screen</strong>, move the app from "Testing" to
              "Production" - left in Testing, Google expires the connection after 7 days no matter what, meaning
              you'd have to reconnect weekly. The console will say there if this scope needs its own verification
              review to publish (a one-time review, not a recurring cost).
            </li>
            <li>Copy that Client ID and Client Secret into the form below and click Save.</li>
          </ol>
          <form className="googlePhotosCredentialForm" onSubmit={this.handleSaveCredentials}>
            <input
              type="text" placeholder="Client ID"
              value={this.state.clientIdInput}
              onChange={(e) => this.setState({ clientIdInput: e.target.value })}
            />
            <input
              type="password" placeholder="Client Secret"
              value={this.state.clientSecretInput}
              onChange={(e) => this.setState({ clientSecretInput: e.target.value })}
            />
            <button type="submit" disabled={this.state.savingCredentials}>Save</button>
          </form>
          {this.state.credentialError && <p className="googlePhotosWatchError">{this.state.credentialError}</p>}
        </div>
      );
    }

    if (!status.connected) {
      return (
        <div className="googlePhotosConnectionPanel">
          <p className="googlePhotosBlurb">Client saved. Connect your Google account to start syncing albums.</p>
          <a className="googlePhotosConnectButton" href={oauthStartUrl()}>Connect Google Photos</a>
          <button onClick={() => this.setState({ credentialStatus: { ...status, configured: false } })}>
            Change client
          </button>
        </div>
      );
    }

    return (
      <div className="googlePhotosConnectionPanel googlePhotosConnected">
        <span>✓ Connected to Google Photos.</span>
        <button onClick={() => this.setState({ credentialStatus: { ...status, configured: false } })}>
          Change client
        </button>
      </div>
    );
  }

  render() {
    const watches = this.props.watches || [];
    const connected = this.state.credentialStatus?.connected;
    return (
      <div className="googlePhotosTool">
        <div className="googlePhotosHowItWorks">
          <p className="googlePhotosBlurb">
            Google's own API has no way to watch an album for new photos automatically - there's no
            "check for updates" button Google offers, only a picker the user has to go through by hand
            every time.
          </p>
          <p className="googlePhotosBlurb">
            <strong>To pick up new photos:</strong> click "Sync now" on an album whenever you want to
            check it - this opens Google Photos in a new tab. Reselect <em>everything currently in the
            album</em>, not just the new items (Google doesn't support partial/incremental selection).
            That's safe to do every time: photos already downloaded here are automatically skipped, so
            only genuinely new ones get pulled in. There's no reminder built in - do this on whatever
            schedule makes sense for you (e.g. whenever someone tells you they've added photos).
          </p>
        </div>

        {this.renderConnectionPanel()}

        {!connected ? null : <>
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
        </>}
      </div>
    );
  }
}

export default GooglePhotosTool;
