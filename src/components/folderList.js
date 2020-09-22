import React from 'react';
import Folder from './folderObj'

class FolderList extends React.Component{
  
  constructor(props) {
    super(props);
    this.state = {
      folders: this.props.folders
    }
  }
  
  componentDidUpdate(prevProps, prevState, snapshot) {
        
    if (prevState.folders !== this.props.folders){
      this.setState({
        folders: this.props.folders
      })
    }
  }
  render() {
    // const folders = this.props.folders
    const items = []
    
    const myData = [].concat(this.state.folders)
    myData.sort()

    // TODO: key values need to be more stable
    for (const [index, value] of myData.entries()) {
      // items.push(<button key={index} className="folderButton">{value}</button>)
      items.push(<Folder key={index} value={value} updateSource={this.props.setSource} />)
    }
    
    return(
      <div className="sidebarList" id="folderSidebar">
        {items}
      </div>
    );
  }
  
}

export default FolderList