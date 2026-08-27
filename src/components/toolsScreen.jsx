import React from 'react';

// Mocked scaffolding for the Tools tab - names/content here are all
// placeholders. Deliberately self-contained (no props from PicasaScreen,
// no real API calls) so this is a one-file add and a one-file remove:
// delete this file and the single <ToolsScreen /> line in
// picasaScreen.jsx's renderSidebar(), and the Tools tab is back to a stub.
const MOCK_TOOLS = [
  { id: 'duplicate-finder', name: 'Duplicate Finder', blurb: 'Scan the library for likely duplicate photos and review them side by side before deciding what to keep.' },
  { id: 'batch-rename', name: 'Batch Rename', blurb: 'Rename a folder of photos in bulk using a naming pattern, instead of one at a time.' },
  { id: 'export-report', name: 'Export Report', blurb: 'Generate a summary report of people, face counts, and review progress for a given date range.' },
];

class ToolsScreen extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      selectedToolId: MOCK_TOOLS[0].id,
      mockOption: 'option-a',
      mockCheckboxA: false,
      mockCheckboxB: true,
    }
  }

  render() {
    const selectedTool = MOCK_TOOLS.find(t => t.id === this.state.selectedToolId)

    return (
      <div>
        <div className="sidebarList" id="toolSidebar">
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
        </div>
      </div>
    );
  }
}

export default ToolsScreen
