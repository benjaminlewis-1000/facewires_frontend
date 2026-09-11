import React from 'react';
import '../css/upload.css';
import { ACCEPTED_EXTENSIONS } from './uploadActions';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// The actual pipeline (hashing, single-shot vs chunked, retry, resume-
// on-reload) lives in picasaScreen.jsx, not here - this component is a
// thin, unmounts-on-tab-switch view over uploads/onStartUpload/
// onRetryUpload/onDismissUpload props threaded down from there. See
// CLAUDE.md/picasaScreen.jsx's own comment on state.uploads for why.
class UploadTool extends React.Component {
  constructor(props) {
    super(props);
    this.state = { dragOver: false };
    this.fileInputRef = React.createRef();
    this.handleDrop = this.handleDrop.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);
    this.handleFilePick = this.handleFilePick.bind(this);
    this.openFileDialog = this.openFileDialog.bind(this);
  }

  addFiles(fileList) {
    Array.from(fileList).forEach(file => this.props.onStartUpload(file));
  }

  handleDrop(event) {
    event.preventDefault();
    this.setState({ dragOver: false });
    this.addFiles(event.dataTransfer.files);
  }

  handleDragOver(event) {
    event.preventDefault();
    this.setState({ dragOver: true });
  }

  handleDragLeave(event) {
    event.preventDefault();
    this.setState({ dragOver: false });
  }

  handleFilePick(event) {
    this.addFiles(event.target.files);
    // Reset so picking the exact same file again later still fires
    // onChange - the input's own value doesn't otherwise change.
    event.target.value = '';
  }

  openFileDialog() {
    this.fileInputRef.current.click();
  }

  renderJob(job) {
    const { onRetryUpload, onDismissUpload } = this.props;
    return (
      <div key={job.id} className="uploadJobRow">
        <div className="uploadJobHeader">
          <span className="uploadJobFilename">{job.filename}</span>
          <span className="uploadJobSize">{formatBytes(job.size)}</span>
          {job.kind === 'chunked' && <span className="uploadJobKind">chunked</span>}
        </div>

        {(job.status === 'hashing' || job.status === 'uploading') && (
          <div className="uploadProgressTrack">
            <div className="uploadProgressFill" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            <span className="uploadProgressLabel">
              {job.status === 'hashing' ? 'Checksumming…' : `${Math.round(job.progress * 100)}%`}
            </span>
          </div>
        )}

        {job.status === 'failed' && (
          <div className="uploadJobError">
            <span>{job.error}</span>
            <button onClick={() => onRetryUpload(job.id)}>Retry</button>
            <button onClick={() => onDismissUpload(job.id)}>Dismiss</button>
          </div>
        )}

        {job.status === 'completed' && (
          <div className="uploadJobResults">
            {job.results.files.map((f, i) => (
              <div key={i} className={`uploadResultEntry uploadResult-${f.status}`}>
                <span className="uploadResultFilename">{f.filename}</span>
                <span className="uploadResultStatus">
                  {f.status === 'accepted' ? '✓ Uploaded' : f.status === 'skipped' ? `Skipped${f.reason ? ` — ${f.reason}` : ''}` : `Rejected — ${f.reason || 'unknown reason'}`}
                </span>
              </div>
            ))}
            {job.results.files.some(f => f.status === 'accepted') && (
              <p className="uploadCompleteNote">Uploaded — it'll appear in your library shortly (the ingestion scan isn't instant).</p>
            )}
            <button onClick={() => onDismissUpload(job.id)}>Dismiss</button>
          </div>
        )}
      </div>
    );
  }

  render() {
    const uploads = this.props.uploads || [];
    return (
      <div className="uploadTool">
        <div
          className={`uploadDropzone${this.state.dragOver ? ' uploadDropzoneActive' : ''}`}
          onDrop={this.handleDrop}
          onDragOver={this.handleDragOver}
          onDragLeave={this.handleDragLeave}
          onClick={this.openFileDialog}
        >
          <p>Drag and drop photos, videos, or a .zip here</p>
          <p>or click to choose files</p>
          <p className="uploadAcceptedTypes">{ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(', ')}</p>
          <input
            ref={this.fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={this.handleFilePick}
          />
        </div>

        {uploads.length > 0 && (
          <>
            <div className="uploadJobListHeader">
              {uploads.some(job => job.status === 'completed' || job.status === 'failed') && (
                <button onClick={this.props.onDismissAllUploads}>Dismiss all</button>
              )}
            </div>
            <div className="uploadJobList">
              {uploads.map(job => this.renderJob(job))}
            </div>
          </>
        )}
      </div>
    );
  }
}

export default UploadTool;
