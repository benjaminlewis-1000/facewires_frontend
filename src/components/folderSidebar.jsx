import React from 'react';
// import Folder from './folderObj'
import '../css/folderList.css'

class FolderSidebar extends React.Component{
  
  constructor(props) {
    super(props);
    this.state = {
      folders: this.props.folders,
      folderSelected: 0
    }

    var default_url = this.props.folders[0]
    this.props.setSource('folder', default_url.url, default_url.id)
  }
  
  componentDidUpdate(prevProps, prevState, snapshot) {
        
    if (prevState.folders !== this.props.folders){
      this.setState({
        folders: this.props.folders,
      })
    }
  }


  handleClick(index, url, id) {
    // console.log("Folder: ", index, url)
    this.props.setSource('folder', url, id)
    this.setState({ folderSelected: index })
  }

  makeFolder (value, index, selected) {
    var className = selected ? 'click-state' : 'base-state';
    return(
      <button 
        className={className} 
        key={index}
        // className={className}
        onClick = {() => this.handleClick(index, value.url, value.id) }
      >
        {value.top_level_name}  ({value.num_images})
      </button>
    );
  }

  render() {
    // const folders = this.props.folders
    const items = []
    
    const myData = [].concat(this.state.folders)
    myData.sort()

    var currentFolderYear = myData[0].year;
    items.push(<p key={currentFolderYear} className='yearDivider'>{currentFolderYear}</p>)

    // TODO: key values need to be more stable
    for (const [index, value] of myData.entries()) {
      // items.push(<button key={index} className="folderButton">{value}</button>)
      if (value.year !== currentFolderYear){

        items.push(<p key={value.year} className='yearDivider'>{value.year}</p>)
        currentFolderYear = value.year
      }

      var obj = this.makeFolder(value, index, this.state.folderSelected === index)

      items.push(obj)
    }
    
    return(
      <div className="sidebarList" id="folderSidebar">
        {items}
      </div>
    );
  }
  
}

export default FolderSidebar