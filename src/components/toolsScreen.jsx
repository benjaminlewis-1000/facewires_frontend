import React from 'react';
import GeocodeReviewTool from './geocodeReviewTool';
import UploadTool from './uploadTool';
import GooglePhotosTool from './googlePhotosTool';

// The first real tools this tab has had - see CLAUDE.md. Everything
// below them is still the original mocked scaffolding (names/content all
// placeholders, no real API calls) - the divider rendered just after
// REAL_TOOLS in the sidebar (search "geocodeSidebarDivider" below) exists
// only to visually separate the two; delete it along with MOCK_TOOLS
// itself whenever the mocks finally go, rather than leaving a lone
// divider with nothing beneath it.
const REAL_TOOLS = [
  { id: 'upload', name: 'Upload Photos' },
  { id: 'google-photos', name: 'Google Photos' },
  { id: 'geocode-review', name: 'Fix Geocoding' },
];

const MOCK_TOOLS = [
  { id: 'duplicate-finder', name: 'Duplicate Finder', blurb: 'Scan the library for likely duplicate photos and review them side by side before deciding what to keep.' },
  { id: 'batch-rename', name: 'Batch Rename', blurb: 'Rename a folder of photos in bulk using a naming pattern, instead of one at a time.' },
  { id: 'export-report', name: 'Export Report', blurb: 'Generate a summary report of people, face counts, and review progress for a given date range.' },
];

class ToolsScreen extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      selectedToolId: REAL_TOOLS[0].id,
      mockOption: 'option-a',
      mockCheckboxA: false,
      mockCheckboxB: true,
      // Google Photos sync soft-disabled per the user's own call
      // (2026-09-11) - it works fine for a user's own library/fully-added
      // albums, but a "joined, not saved" shared album isn't reliably
      // searchable in Google's own picker UI (a Google-side indexing gap,
      // not fixable here - see CLAUDE.md), which was the specific use
      // case that prompted this. Rather than remove the feature (it's
      // still genuinely useful for the cases that DO work), it's grayed
      // out in the sidebar and a double-click unlocks it for the rest of
      // this session - a deliberate small speed bump so it isn't
      // presented as a seamless, fully-solved feature, without hiding it
      // entirely. Not persisted (store/localStorage) - deliberately
      // resets on every reload, same reasoning as not persisting it
      // "permanently unlocked" would undercut the whole point of the bump.
      googlePhotosUnlocked: false,
    }
  }

  render() {
    const realTool = REAL_TOOLS.find(t => t.id === this.state.selectedToolId)
    const selectedTool = realTool || MOCK_TOOLS.find(t => t.id === this.state.selectedToolId)

    return (
      <div>
        <div className="sidebarList" id="toolSidebar">
          {REAL_TOOLS.map(tool => {
            const isSoftDisabled = tool.id === 'google-photos' && !this.state.googlePhotosUnlocked
            if (isSoftDisabled) {
              return (
                <button
                  key={tool.id}
                  className="sidebarToolDisabled"
                  title="Known limitation with shared albums not in your library - double-click to use anyway"
                  onDoubleClick={() => this.setState({ googlePhotosUnlocked: true, selectedToolId: tool.id })}
                >
                  {tool.name}
                </button>
              )
            }
            return (
              <button
                key={tool.id}
                className={this.state.selectedToolId === tool.id ? 'click-state' : 'base-state'}
                onClick={() => this.setState({ selectedToolId: tool.id })}
              >
                {tool.name}
              </button>
            )
          })}
          <div className='geocodeSidebarDivider' />
          {MOCK_TOOLS.map(tool => (
            <button
              key={tool.id}
              className={this.state.selectedToolId === tool.id ? 'click-state' : 'base-state'}
              onClick={() => this.setState({ selectedToolId: tool.id })}
            >
              {tool.name}
            </button>
          ))}
        </div>

        <div className='screenHeader'>
          <span className='header_person_name'>{selectedTool.name}</span>
        </div>

        <div className='imageScreen'>
          {this.state.selectedToolId === 'geocode-review' ? (
            <GeocodeReviewTool />
          ) : this.state.selectedToolId === 'upload' ? (
            <UploadTool
              uploads={this.props.uploads}
              onStartUpload={this.props.onStartUpload}
              onRetryUpload={this.props.onRetryUpload}
              onDismissUpload={this.props.onDismissUpload}
              onDismissAllUploads={this.props.onDismissAllUploads}
            />
          ) : this.state.selectedToolId === 'google-photos' ? (
            <GooglePhotosTool
              watches={this.props.photoWatches}
              syncSessions={this.props.photoSyncSessions}
              onFetchWatches={this.props.onFetchPhotoWatches}
              onAddWatch={this.props.onAddWatchedAlbum}
              onRemoveWatch={this.props.onRemoveWatchedAlbum}
              onStartSync={this.props.onStartPhotoSync}
              onDismissSync={this.props.onDismissPhotoSync}
            />
          ) : (
          <div style={{ maxWidth: 480, padding: '10px 4px' }}>
            <p>{selectedTool.blurb}</p>

            <div style={{ margin: '16px 0' }}>
              <label htmlFor='mockOption' style={{ display: 'block', marginBottom: 4 }}>Mock option</label>
              <select
                id='mockOption'
                value={this.state.mockOption}
                onChange={(e) => this.setState({ mockOption: e.target.value })}
              >
                <option value='option-a'>Option A</option>
                <option value='option-b'>Option B</option>
                <option value='option-c'>Option C</option>
              </select>
            </div>

            <div style={{ margin: '8px 0' }}>
              <label>
                <input
                  type='checkbox'
                  checked={this.state.mockCheckboxA}
                  onChange={(e) => this.setState({ mockCheckboxA: e.target.checked })}
                />
                {' '}Mock checkbox A
              </label>
            </div>
            <div style={{ margin: '8px 0' }}>
              <label>
                <input
                  type='checkbox'
                  checked={this.state.mockCheckboxB}
                  onChange={(e) => this.setState({ mockCheckboxB: e.target.checked })}
                />
                {' '}Mock checkbox B
              </label>
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }
}

export default ToolsScreen
